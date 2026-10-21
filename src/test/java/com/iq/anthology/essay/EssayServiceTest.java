package com.iq.anthology.essay;

import static com.iq.anthology.Fixtures.LONG_BODY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.AnthologyService.Admission;
import com.iq.anthology.activity.ActivityType;
import com.iq.anthology.activity.Funnel;
import com.iq.anthology.anthology.AnthologyService.Reissued;
import com.iq.anthology.fake.FakeActivityLog;
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
    private FakeActivityLog activityLog;

    @BeforeEach
    void setUp() {
        FakeAnthologyRepository anthologies = new FakeAnthologyRepository();
        activityLog = new FakeActivityLog();
        anthologyService = new AnthologyService(anthologies, new SequentialIdentifiers(), activityLog, clock);
        essayService = new EssayService(anthologyService, anthologies, new FakeEssayRepository(),
                new FakeReplyRepository(), activityLog, clock);

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

    @Test
    void 글감_질문과_부록은_저장소까지_반영된다() {
        anthologyService.ask(editor.code(), editor.token(), "가장 오래 붙든 문장은?\n\n내 일에 옮긴다면?");
        anthologyService.attachAppendix(editor.code(), editor.token(), "용어사전");

        Anthology anthology = anthologyService.get(editor.code());
        assertThat(anthology.prompts()).containsExactly("가장 오래 붙든 문장은?", "내 일에 옮긴다면?");
        assertThat(anthology.appendix()).isEqualTo("용어사전");
    }

    @Test
    void 엮은이가_링크를_다시_만들면_옛_링크로는_들어올_수_없다() {
        Long potatoId = anthologyService.get(editor.code()).findByToken(potato.token()).orElseThrow().id();

        Reissued reissued = anthologyService.reissueLink(editor.code(), editor.token(), potatoId);

        assertThat(reissued.nickname()).isEqualTo("감자");
        assertThat(reissued.token()).isNotEqualTo(potato.token());
        Anthology anthology = anthologyService.get(editor.code());
        assertThat(anthology.findByToken(potato.token())).isEmpty();
        assertThat(anthology.findByToken(reissued.token())).isPresent();
    }

    @Test
    void 엮은이가_내보내면_그_사람의_글과_자리가_사라진다() {
        essayService.save(editor.code(), potato.token(), "감자의 글", null, LONG_BODY, true);
        Long potatoId = anthologyService.get(editor.code()).findByToken(potato.token()).orElseThrow().id();

        String nickname = essayService.remove(editor.code(), editor.token(), potatoId);

        assertThat(nickname).isEqualTo("감자");
        assertThat(anthologyService.get(editor.code()).contributors()).hasSize(1);
        assertThat(shelf().essays()).isEmpty();
    }

    @Test
    void 참여자는_다른_사람을_내보낼_수_없다() {
        Long editorId = anthologyService.get(editor.code()).editor().id();

        assertThatThrownBy(() -> essayService.remove(editor.code(), potato.token(), editorId))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);
    }

    @Test
    void 엮은이는_마감한_뒤_차례의_순서를_바꾼다() {
        Essay first = essayService.save(editor.code(), editor.token(), "가 글", null, LONG_BODY, true);
        Essay second = essayService.save(editor.code(), potato.token(), "나 글", null, LONG_BODY, true);
        essayService.close(editor.code(), editor.token());

        essayService.move(editor.code(), editor.token(), second.id(), -1);

        assertThat(shelf().submitted()).extracting(Essay::id).containsExactly(second.id(), first.id());
    }

    @Test
    void 맛보기는_쓴_사람만_허락한다() {
        Essay potatoEssay = essayService.save(editor.code(), potato.token(), "감자의 글", null, LONG_BODY, true);
        essayService.save(editor.code(), editor.token(), "엮은이의 글", null, LONG_BODY, true);
        essayService.close(editor.code(), editor.token());

        assertThatThrownBy(() -> essayService.allowPublicSample(editor.code(), editor.token(), potatoEssay.id(), true))
                .extracting("type").isEqualTo(ErrorType.FORBIDDEN);

        essayService.allowPublicSample(editor.code(), potato.token(), potatoEssay.id(), true);
        assertThat(shelf().publicSample()).map(Essay::id).contains(potatoEssay.id());
    }

    @Test
    void 참여부터_읽기까지_흐름을_센다() {
        Essay editorEssay = essayService.save(editor.code(), editor.token(), "엮은이의 글", null, LONG_BODY, true);
        essayService.save(editor.code(), potato.token(), "감자의 글", null, LONG_BODY, true);
        essayService.read(editor.code(), potato.token(), editorEssay.id());
        essayService.read(editor.code(), potato.token(), editorEssay.id());

        Funnel funnel = essayService.funnel(shelf());

        assertThat(funnel.joined()).isEqualTo(2);
        assertThat(funnel.submitted()).isEqualTo(2);
        assertThat(funnel.engagement().readers()).isEqualTo(1);
        assertThat(funnel.engagement().readPairs()).isEqualTo(1);
        assertThat(activityLog.types()).contains(ActivityType.JOINED, ActivityType.FIRST_SAVED,
                ActivityType.SUBMITTED, ActivityType.READ_OTHERS);
    }

    private Shelf shelf() {
        return essayService.shelf(anthologyService.get(editor.code()));
    }
}
