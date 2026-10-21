package com.iq.anthology;

import static com.iq.anthology.Fixtures.LONG_BODY;
import static com.iq.anthology.Fixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.activity.ActivityLog.Engagement;
import com.iq.anthology.activity.ActivityType;
import com.iq.anthology.activity.JdbcActivityLog;
import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.anthology.JdbcAnthologyRepository;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.JdbcEssayRepository;
import com.iq.anthology.essay.JdbcReplyRepository;
import com.iq.anthology.essay.Reply;
import com.iq.anthology.room.JdbcRoomMessageRepository;
import com.iq.anthology.room.RoomMessage;
import com.iq.anthology.support.ErrorType;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.context.annotation.Import;

/** 실제 H2에서 매핑과 DB 제약(동시성 방어선)을 확인한다. */
@JdbcTest
@Import({JdbcAnthologyRepository.class, JdbcEssayRepository.class, JdbcReplyRepository.class, JdbcActivityLog.class,
        JdbcRoomMessageRepository.class})
class JdbcRepositoryTest {

    @Autowired
    private JdbcAnthologyRepository anthologies;
    @Autowired
    private JdbcEssayRepository essays;
    @Autowired
    private JdbcReplyRepository replies;
    @Autowired
    private JdbcActivityLog activity;
    @Autowired
    private JdbcRoomMessageRepository roomMessages;

    private Anthology anthology;

    @BeforeEach
    void setUp() {
        anthology = Anthology.open("abcd2345", "일단 나부터 읽어 봅니다", "리팩터링", "마틴 파울러",
                LocalDate.of(2026, 11, 30), "레오", "한동희", "token-editor", NOW);
        anthologies.save(anthology);
    }

    @Test
    void 문집과_참여자를_저장하고_그대로_읽는다() {
        anthologies.addContributor(anthology.id(), anthology.join("감자", null, "token-potato", NOW));

        Anthology found = anthologies.findByCode("abcd2345").orElseThrow();

        assertThat(found.title()).isEqualTo("일단 나부터 읽어 봅니다");
        assertThat(found.dueDate()).isEqualTo(LocalDate.of(2026, 11, 30));
        assertThat(found.contributors()).extracting(Contributor::byline).containsExactly("레오(한동희)", "감자");
        assertThat(anthologies.findByContributorToken("token-potato")).map(Anthology::code).contains("abcd2345");
    }

    @Test
    void 같은_참여_순서가_동시에_들어오면_충돌이다() {
        Contributor first = anthologies.findByCode("abcd2345").orElseThrow().join("감자", null, "t1", NOW);
        Contributor racing = anthologies.findByCode("abcd2345").orElseThrow().join("구름", null, "t2", NOW);

        anthologies.addContributor(anthology.id(), first);

        assertThatThrownBy(() -> anthologies.addContributor(anthology.id(), racing))
                .extracting("type").isEqualTo(ErrorType.CONFLICT);
    }

    @Test
    void 이미_마감된_문집을_다시_마감하면_충돌이다() {
        Anthology first = anthologies.findByCode("abcd2345").orElseThrow();
        Anthology racing = anthologies.findByCode("abcd2345").orElseThrow();
        first.close(first.editor(), 2, NOW);
        racing.close(racing.editor(), 2, NOW);

        anthologies.markClosed(first);

        assertThatThrownBy(() -> anthologies.markClosed(racing))
                .extracting("type").isEqualTo(ErrorType.CONFLICT);
        assertThat(anthologies.findByCode("abcd2345").orElseThrow().isClosed()).isTrue();
    }

    @Test
    void 한_사람은_한_문집에_한_편만_쓴다() {
        Long editorId = anthology.editor().id();
        essays.save(Essay.start(anthology.id(), editorId, NOW));

        assertThatThrownBy(() -> essays.save(Essay.start(anthology.id(), editorId, NOW)))
                .extracting("type").isEqualTo(ErrorType.CONFLICT);
    }

    @Test
    void 긴_본문과_제출_상태를_그대로_읽는다() {
        Essay essay = essays.save(Essay.start(anthology.id(), anthology.editor().id(), NOW));
        String longBody = LONG_BODY.repeat(80);
        essay.revise("제목", "밑줄", longBody, NOW);
        essay.submit(NOW.plusHours(1));
        essays.update(essay);

        Essay found = essays.findByAnthologyIdAndContributorId(anthology.id(), anthology.editor().id()).orElseThrow();

        assertThat(found.body()).isEqualTo(longBody.strip()); // 저장할 때 앞뒤 공백을 다듬는다
        assertThat(found.isSubmitted()).isTrue();
        assertThat(found.submittedAt()).isEqualTo(NOW.plusHours(1));
    }

    @Test
    void 답글을_글별로_모아_읽는다() {
        Contributor potato = anthologies.addContributor(anthology.id(), anthology.join("감자", null, "tp", NOW));
        Essay essay = essays.save(Essay.start(anthology.id(), anthology.editor().id(), NOW));
        essay.revise("제목", null, LONG_BODY, NOW);
        essay.submit(NOW);
        essays.update(essay);

        replies.save(Reply.to(essay, potato.id(), "잘 읽었어요", NOW));

        assertThat(replies.findByEssayIds(List.of(essay.id()))).extracting(Reply::body).containsExactly("잘 읽었어요");
        assertThat(replies.findByEssayIds(List.of())).isEmpty();
    }

    @Test
    void 글감_질문_부록_순서_맛보기를_그대로_읽는다() {
        Anthology found = anthologies.findByCode("abcd2345").orElseThrow();
        found.ask(found.editor(), "가장 오래 붙든 문장은?");
        found.attachAppendix(found.editor(), "용어사전");
        anthologies.updateTexts(found);

        Essay essay = essays.save(Essay.start(anthology.id(), anthology.editor().id(), NOW));
        essay.revise("제목", null, LONG_BODY, NOW);
        essay.submit(NOW);
        essay.allowPublicSample(anthology.editor().id(), true);
        essays.update(essay);

        Anthology reread = anthologies.findByCode("abcd2345").orElseThrow();
        assertThat(reread.prompts()).containsExactly("가장 오래 붙든 문장은?");
        assertThat(reread.appendix()).isEqualTo("용어사전");
        Essay rereadEssay = essays.findByAnthologyId(anthology.id()).get(0);
        assertThat(rereadEssay.publicSample()).isTrue();
        assertThat(rereadEssay.bookOrder()).isNull();
    }

    @Test
    void 참여자를_지우면_글과_답글이_함께_사라진다() {
        Contributor potato = anthologies.addContributor(anthology.id(), anthology.join("감자", null, "tp", NOW));
        Essay editorEssay = essays.save(Essay.start(anthology.id(), anthology.editor().id(), NOW));
        editorEssay.revise("엮은이", null, LONG_BODY, NOW);
        editorEssay.submit(NOW);
        essays.update(editorEssay);
        Essay potatoEssay = essays.save(Essay.start(anthology.id(), potato.id(), NOW));
        potatoEssay.revise("감자", null, LONG_BODY, NOW);
        potatoEssay.submit(NOW);
        essays.update(potatoEssay);
        replies.save(Reply.to(editorEssay, potato.id(), "감자가 엮은이에게", NOW));
        replies.save(Reply.to(potatoEssay, anthology.editor().id(), "엮은이가 감자에게", NOW));
        activity.record(anthology.id(), potato.id(), ActivityType.READ_OTHERS, editorEssay.id());

        replies.deleteAllAround(potato.id());
        essays.deleteByContributor(potato.id());
        activity.forgetContributor(potato.id());
        anthologies.deleteContributor(potato.id());

        assertThat(anthologies.findByCode("abcd2345").orElseThrow().contributors()).hasSize(1);
        assertThat(essays.findByAnthologyId(anthology.id())).extracting(Essay::title).containsExactly("엮은이");
        assertThat(replies.findByEssayIds(List.of(editorEssay.id(), potatoEssay.id()))).isEmpty();
        assertThat(activity.engagement(anthology.id())).isEqualTo(Engagement.NONE);
    }

    @Test
    void 링크를_다시_만들면_새_토큰으로만_찾는다() {
        Anthology found = anthologies.findByCode("abcd2345").orElseThrow();
        Contributor editor = found.editor();
        found.reissueLink(editor, anthologies.addContributor(anthology.id(), found.join("감자", null, "old", NOW)).id(),
                "new-token");
        anthologies.updateToken(found.findByToken("new-token").orElseThrow());

        assertThat(anthologies.findByContributorToken("old")).isEmpty();
        assertThat(anthologies.findByContributorToken("new-token")).isPresent();
    }

    @Test
    void 행동_기록은_서로_다른_사람과_쌍으로_센다() {
        Long me = anthology.editor().id();
        activity.record(anthology.id(), me, ActivityType.READ_OTHERS, 100L);
        activity.record(anthology.id(), me, ActivityType.READ_OTHERS, 100L);
        activity.record(anthology.id(), me, ActivityType.READ_OTHERS, 101L);
        activity.record(anthology.id(), me, ActivityType.PDF_DOWNLOADED, null);
        activity.record(anthology.id(), me, ActivityType.EPUB_DOWNLOADED, null);
        activity.record(anthology.id(), null, ActivityType.ABOUT_VIEWED, null);

        assertThat(activity.engagement(anthology.id())).isEqualTo(new Engagement(1, 2, 1, 1));
    }

    @Test
    void 모임방은_최근_말을_오래된_순으로_돌려준다() {
        Long editorId = anthology.editor().id();
        for (int i = 1; i <= 5; i++) {
            roomMessages.save(RoomMessage.say(anthology.id(), editorId, "말 " + i, NOW.plusMinutes(i)));
        }

        assertThat(roomMessages.recent(anthology.id(), 3)).extracting(RoomMessage::body)
                .containsExactly("말 3", "말 4", "말 5");

        roomMessages.deleteByContributor(editorId);
        assertThat(roomMessages.recent(anthology.id(), 3)).isEmpty();
    }

    @Test
    void 마지막_접속은_1분_안에_다시_쓰지_않는다() {
        Long editorId = anthology.editor().id();
        anthologies.touch(editorId, NOW.plusMinutes(10));
        anthologies.touch(editorId, NOW.plusMinutes(10).plusSeconds(30));

        assertThat(anthologies.findByCode("abcd2345").orElseThrow().editor().lastSeenAt())
                .isEqualTo(NOW.plusMinutes(10));

        anthologies.touch(editorId, NOW.plusMinutes(12));
        assertThat(anthologies.findByCode("abcd2345").orElseThrow().editor().lastSeenAt())
                .isEqualTo(NOW.plusMinutes(12));
    }
}
