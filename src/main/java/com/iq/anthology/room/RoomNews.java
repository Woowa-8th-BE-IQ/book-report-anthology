package com.iq.anthology.room;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.essay.EssayEvents;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.essay.Shelf;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 문집 소식을 방(과 펫)에 알린다: 누가 독후감을 냈다, 내 글에 답글이 달렸다, 모집을 마감했다, 마감이 코앞이다.
 *
 * <p>소식은 저장하지 않는다. 지금 방(펫)에 연결된 사람에게만 "news" 이벤트로 보낸다.
 * 잠긴 글의 본문은 보내지 않는다. 몇 편이 열리는지 같은 숫자만 보낸다.
 * 소식을 못 보내도 글쓰기·답글은 그대로 성공해야 하므로 실패는 기록만 하고 삼킨다.
 */
@Component
public class RoomNews {

    private static final Logger log = LoggerFactory.getLogger(RoomNews.class);
    /** 마감 재촉은 낮에만(밤에 펫이 조르지 않게). */
    private static final int NUDGE_FROM_HOUR = 9;
    private static final int NUDGE_UNTIL_HOUR = 23;
    private static final int SNIPPET_MAX = 60;

    private final RoomHub hub;
    private final AnthologyService anthologyService;
    private final EssayService essayService;
    private final Clock clock;
    /** 방 id → 문집 코드. 들어온 적 있는 방만 마감 재촉을 돌린다. */
    private final Map<Long, String> codes = new ConcurrentHashMap<>();
    /** 하루에 한 번만 재촉한다: "문집:사람:날짜". */
    private final Set<String> nudged = ConcurrentHashMap.newKeySet();

    public RoomNews(RoomHub hub, AnthologyService anthologyService, EssayService essayService, Clock clock) {
        this.hub = hub;
        this.anthologyService = anthologyService;
        this.essayService = essayService;
        this.clock = clock;
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void on(EssayEvents.Submitted event) {
        safely(() -> {
            Anthology anthology = anthologyService.get(event.code());
            Contributor writer = contributor(anthology, event.contributorId()).orElse(null);
            if (writer == null) {
                return;
            }
            Shelf shelf = essayService.shelf(anthology);
            String title = writer.nickname() + "님이 독후감을 냈어요";
            for (Long viewerId : hub.online(anthology.id())) {
                if (viewerId.equals(writer.id())) {
                    continue;
                }
                Contributor viewer = contributor(anthology, viewerId).orElse(null);
                if (viewer == null) {
                    continue;
                }
                boolean canRead = anthology.isClosed() || shelf.hasSubmitted(viewer);
                Map<String, Object> news = canRead
                        ? news("submitted", writer.id(), title, "지금 읽을 수 있어요.",
                        "/anthologies/" + anthology.code() + "/essays/" + event.essayId())
                        : news("submitted", writer.id(), title,
                        "내 글을 내면 " + lockedFor(shelf, viewer) + "편이 열려요.", writePage(anthology));
                hub.sendTo(anthology.id(), viewerId, "news", news);
            }
        });
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void on(EssayEvents.Replied event) {
        if (event.writerId().equals(event.replierId())) {
            return; // 내 글에 내가 단 답글
        }
        safely(() -> {
            Anthology anthology = anthologyService.get(event.code());
            contributor(anthology, event.replierId()).ifPresent(replier ->
                    hub.sendTo(anthology.id(), event.writerId(), "news", news("reply", replier.id(),
                            replier.nickname() + "님이 내 글에 답글을 달았어요", snippet(event.body()),
                            "/anthologies/" + anthology.code() + "/essays/" + event.essayId())));
        });
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void on(EssayEvents.Closed event) {
        safely(() -> {
            Anthology anthology = anthologyService.get(event.code());
            hub.broadcast(anthology.id(), "news", news("closed", null, "모집을 마감했어요",
                    "이제 한 권으로 엮을 차례예요.", "/anthologies/" + anthology.code()));
        });
    }

    /** 방에 들어오면(펫이 켜지면) 마감이 가까운지 본다. */
    void greet(Anthology anthology, Contributor me) {
        codes.put(anthology.id(), anthology.code());
        safely(() -> nudge(anthology, me));
    }

    /** 켜져 있는 펫에도 하루 한 번 마감을 알린다. */
    @Scheduled(initialDelay = 120_000, fixedDelay = 600_000)
    public void nudgeOnline() {
        String today = LocalDate.now(clock).toString();
        nudged.removeIf(key -> !key.endsWith(today)); // 지난 날의 기록은 버린다
        for (Long anthologyId : hub.activeRooms()) {
            String code = codes.get(anthologyId);
            if (code == null) {
                continue;
            }
            safely(() -> {
                Anthology anthology = anthologyService.get(code);
                for (Long contributorId : hub.online(anthologyId)) {
                    contributor(anthology, contributorId).ifPresent(contributor -> nudge(anthology, contributor));
                }
            });
        }
    }

    /**
     * 마감이 오늘이나 내일인데 아직 내지 않은 사람에게, 하루 한 번 낮에만 알린다.
     *
     * @return 알렸으면 true
     */
    boolean nudge(Anthology anthology, Contributor contributor) {
        if (anthology.isClosed() || anthology.dueDate() == null) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        long daysLeft = ChronoUnit.DAYS.between(now.toLocalDate(), anthology.dueDate());
        if (daysLeft < 0 || daysLeft > 1 || now.getHour() < NUDGE_FROM_HOUR || now.getHour() >= NUDGE_UNTIL_HOUR) {
            return false;
        }
        String key = anthology.id() + ":" + contributor.id() + ":" + now.toLocalDate();
        if (nudged.contains(key)) {
            return false;
        }
        Shelf shelf = essayService.shelf(anthology);
        if (shelf.hasSubmitted(contributor)) {
            return false;
        }
        nudged.add(key);
        long locked = lockedFor(shelf, contributor);
        String start = shelf.essayOf(contributor).isPresent() ? "쓰던 글을 마저 내면 " : "독후감을 내면 ";
        String text = locked > 0 ? start + locked + "편이 열려요." : "아직 아무도 안 냈어요. 첫 글이 돼 보세요.";
        hub.sendTo(anthology.id(), contributor.id(), "news",
                news("due", null, daysLeft == 0 ? "오늘이 마감이에요" : "내일이 마감이에요", text, writePage(anthology)));
        return true;
    }

    /** 내가 내면 열리는 남의 글 수. */
    private static long lockedFor(Shelf shelf, Contributor viewer) {
        return shelf.submitted().stream().filter(essay -> !essay.isWrittenBy(viewer.id())).count();
    }

    private static String writePage(Anthology anthology) {
        return "/anthologies/" + anthology.code() + "/write";
    }

    private static Optional<Contributor> contributor(Anthology anthology, Long id) {
        return anthology.contributors().stream().filter(contributor -> contributor.id().equals(id)).findFirst();
    }

    private static String snippet(String body) {
        String flat = body == null ? "" : body.strip().replaceAll("\\s+", " ");
        int[] points = flat.codePoints().toArray();
        return points.length <= SNIPPET_MAX ? flat : new String(points, 0, SNIPPET_MAX) + "…";
    }

    /** kind: submitted·reply·closed·due. actorId가 있으면 그 사람 얼굴을 띄운다. link는 누르면 열 화면. */
    static Map<String, Object> news(String kind, Long actorId, String title, String text, String link) {
        Map<String, Object> news = new LinkedHashMap<>();
        news.put("kind", kind);
        news.put("actorId", actorId);
        news.put("title", title);
        news.put("text", text);
        news.put("link", link);
        return news;
    }

    private static void safely(Runnable work) {
        try {
            work.run();
        } catch (RuntimeException e) {
            log.warn("문집 소식을 보내지 못했어요: {}", e.getMessage());
        }
    }
}
