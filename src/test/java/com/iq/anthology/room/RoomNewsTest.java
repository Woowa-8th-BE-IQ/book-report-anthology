package com.iq.anthology.room;

import static com.iq.anthology.Fixtures.LONG_BODY;
import static org.assertj.core.api.Assertions.assertThat;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.AnthologyService.Admission;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.fake.FakeActivityLog;
import com.iq.anthology.fake.FakeAnthologyRepository;
import com.iq.anthology.fake.FakeEssayRepository;
import com.iq.anthology.fake.FakeReplyRepository;
import com.iq.anthology.fake.SequentialIdentifiers;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

/** 마감 재촉: 오늘·내일 마감, 아직 안 낸 사람, 낮에, 하루 한 번. */
class RoomNewsTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private RoomNews newsAt(String instant, FakeAnthologyRepository anthologies, AnthologyService anthologyService) {
        Clock clock = Clock.fixed(Instant.parse(instant), SEOUL);
        EssayService essays = new EssayService(anthologyService, anthologies, new FakeEssayRepository(),
                new FakeReplyRepository(), new FakeActivityLog(), clock, event -> { });
        return new RoomNews(new RoomHub(), anthologyService, essays, clock);
    }

    private record Setup(FakeAnthologyRepository anthologies, AnthologyService service, Admission editor,
                         Admission potato) {

        Anthology anthology() {
            return service.get(editor.code());
        }

        Contributor potatoInside() {
            return anthology().findByToken(potato.token()).orElseThrow();
        }
    }

    private Setup setup(LocalDate due) {
        FakeAnthologyRepository anthologies = new FakeAnthologyRepository();
        Clock opened = Clock.fixed(Instant.parse("2026-10-20T01:00:00Z"), SEOUL);
        AnthologyService service = new AnthologyService(anthologies, new SequentialIdentifiers(),
                new FakeActivityLog(), opened);
        Admission editor = service.open("일단 나부터 읽어 봅니다", "리팩터링", null, due, "레오", null);
        Admission potato = service.join(editor.code(), "감자", null);
        return new Setup(anthologies, service, editor, potato);
    }

    @Test
    void 내일_마감인데_안_냈으면_하루에_한_번만_알린다() {
        Setup s = setup(LocalDate.of(2026, 10, 21));
        RoomNews news = newsAt("2026-10-20T02:00:00Z", s.anthologies(), s.service()); // 서울 11시

        assertThat(news.nudge(s.anthology(), s.potatoInside())).isTrue();
        assertThat(news.nudge(s.anthology(), s.potatoInside())).isFalse();
    }

    @Test
    void 밤이거나_마감이_멀면_알리지_않는다() {
        Setup s = setup(LocalDate.of(2026, 10, 21));
        assertThat(newsAt("2026-10-20T15:00:00Z", s.anthologies(), s.service()) // 서울 자정
                .nudge(s.anthology(), s.potatoInside())).isFalse();

        Setup far = setup(LocalDate.of(2026, 10, 25));
        assertThat(newsAt("2026-10-20T02:00:00Z", far.anthologies(), far.service())
                .nudge(far.anthology(), far.potatoInside())).isFalse();
    }

    @Test
    void 이미_냈으면_알리지_않는다() {
        Setup s = setup(LocalDate.of(2026, 10, 20));
        Clock clock = Clock.fixed(Instant.parse("2026-10-20T02:00:00Z"), SEOUL);
        EssayService essays = new EssayService(s.service(), s.anthologies(), new FakeEssayRepository(),
                new FakeReplyRepository(), new FakeActivityLog(), clock, event -> { });
        essays.save(s.editor().code(), s.potato().token(), "제목", null, LONG_BODY, true);
        RoomNews news = new RoomNews(new RoomHub(), s.service(), essays, clock);

        assertThat(news.nudge(s.anthology(), s.potatoInside())).isFalse();
    }
}
