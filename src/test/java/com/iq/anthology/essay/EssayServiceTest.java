package com.iq.anthology.essay;

import static com.iq.anthology.Fixtures.LONG_BODY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.AnthologyService.Admission;
import com.iq.anthology.fake.FakeAnthologyRepository;
import com.iq.anthology.fake.FakeEssayRepository;
import com.iq.anthology.fake.FakeReplyRepository;
import com.iq.anthology.fake.SequentialIdentifiers;
import com.iq.anthology.support.ErrorType;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** 저장소는 Fake로 바꾸고 서비스의 조합 규칙(잠금 해제, 마감, 저장 누락)을 본다. */
class EssayServiceTest {

    private final Clock clock = Clock.fixed(Instant.parse("2026-10-20T11:00:00Z"), ZoneId.of("Asia/Seoul"));
    private AnthologyService anthologyService;
    private EssayService essayService;
    private Admission editor;
    private Admission potato;

    @BeforeEach
    void setUp() {
        FakeAnthologyRepository anthologies = new FakeAnthologyRepository();
        anthologyService = new AnthologyService(anthologies, new SequentialIdentifiers(), clock);
        essayService = new EssayService(anthologyService, anthologies, new FakeEssayRepository(),
                new FakeReplyRepository(), clock);

        editor = anthologyService.open("일단 나부터 읽어 봅니다", "리팩터링", "마틴 파울러", null, "레오", "한동희");
        potato = anthologyService.join(editor.code(), "감자", null);
    }

    @Test
    void 처음_저장하면_초안이_생기고_다시_저장하면_같은_글을_고친다() {
        essayService.save(editor.code(), potato.token(), "가제", null, "첫 줄", false);
        essayService.save(editor.code(), potato.token(), "코드보다 나를 먼저", null, "고친 첫 줄", false);

        Shelf shelf = shelf();
        assertThat(shelf.essays()).singleElement().satisfies(essay -> {
            assertThat(essay.title()).isEqualTo("코드보다 나를 먼저");
            assertThat(essay.body()).isEqualTo("고친 첫 줄");
            assertThat(essay.isSubmitted()).isFalse();
        });
    }

    @Test
    void 제출해야_남의_글이_열린다() {
        Essay editorEssay = essayService.save(editor.code(), editor.token(), "엮은이의 글", null, LONG_BODY, true);
        essayService.save(editor.code(), potato.token(), "감자의 초안", null, LONG_BODY, false);

        Anthology anthology = anthologyService.get(editor.code());
        assertThatThrownBy(() -> EssayService.readable(shelf(), anthology.findByToken(potato.token()).orElseThrow(),
                editorEssay.id()))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);

        essayService.save(editor.code(), potato.token(), "감자의 글", null, LONG_BODY, true);

        assertThat(EssayService.readable(shelf(), anthology.findByToken(potato.token()).orElseThrow(),
                editorEssay.id()).title()).isEqualTo("엮은이의 글");
    }

    @Test
    void 엮은이가_마감하면_더_쓸_수_없다() {
        essayService.save(editor.code(), editor.token(), "엮은이의 글", null, LONG_BODY, true);
        essayService.save(editor.code(), potato.token(), "감자의 글", null, LONG_BODY, true);

        essayService.close(editor.code(), editor.token());

        assertThat(anthologyService.get(editor.code()).isClosed()).isTrue();
        assertThatThrownBy(() -> essayService.save(editor.code(), potato.token(), "고침", null, LONG_BODY, false))
                .hasMessageContaining("마감한 문집");
    }

    @Test
    void 참여자가_아니면_마감할_수_없다() {
        assertThatThrownBy(() -> essayService.close(editor.code(), "stranger"))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);
    }

    @Test
    void 답글은_읽을_수_있는_남의_글에만_단다() {
        Essay editorEssay = essayService.save(editor.code(), editor.token(), "엮은이의 글", null, LONG_BODY, true);

        assertThatThrownBy(() -> essayService.reply(editor.code(), potato.token(), editorEssay.id(), "궁금해요"))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);

        essayService.save(editor.code(), potato.token(), "감자의 글", null, LONG_BODY, true);
        essayService.reply(editor.code(), potato.token(), editorEssay.id(), "잘 읽었어요");

        assertThat(shelf().repliesOf(shelf().findById(editorEssay.id()).orElseThrow()))
                .extracting(Reply::body).containsExactly("잘 읽었어요");
    }

    @Test
    void 책_포함_여부는_마감한_뒤에만_바꾼다() {
        Essay potatoEssay = essayService.save(editor.code(), potato.token(), "감자의 글", null, LONG_BODY, true);

        assertThatThrownBy(() -> essayService.changeInclusion(editor.code(), potato.token(), potatoEssay.id(), false))
                .hasMessageContaining("마감한 뒤");
    }

    @Test
    void 도서_소개는_저장소까지_반영된다() {
        anthologyService.introduce(editor.code(), editor.token(), "함께 읽었습니다.");

        assertThat(anthologyService.get(editor.code()).introduction()).isEqualTo("함께 읽었습니다.");
    }

    private Shelf shelf() {
        return essayService.shelf(anthologyService.get(editor.code()));
    }
}
