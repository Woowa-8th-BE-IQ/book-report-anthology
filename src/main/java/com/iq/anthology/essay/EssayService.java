package com.iq.anthology.essay;

import com.iq.anthology.activity.ActivityLog;
import com.iq.anthology.activity.ActivityType;
import com.iq.anthology.activity.Funnel;
import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyRepository;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.support.DomainException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EssayService {

    private final AnthologyService anthologyService;
    private final AnthologyRepository anthologyRepository;
    private final EssayRepository essayRepository;
    private final ReplyRepository replyRepository;
    private final ActivityLog activityLog;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public EssayService(AnthologyService anthologyService, AnthologyRepository anthologyRepository,
                        EssayRepository essayRepository, ReplyRepository replyRepository, ActivityLog activityLog,
                        Clock clock, ApplicationEventPublisher events) {
        this.anthologyService = anthologyService;
        this.anthologyRepository = anthologyRepository;
        this.essayRepository = essayRepository;
        this.replyRepository = replyRepository;
        this.activityLog = activityLog;
        this.clock = clock;
        this.events = events;
    }

    /** 내 독후감을 저장한다. submit이면 제출까지 한다. 첫 저장이면 새로 만든다. 자동 저장도 이 길로 온다. */
    @Transactional
    public Essay save(String code, String token, String title, String quote, String body, boolean submit) {
        Anthology anthology = locked(code);
        anthology.requireCollecting("마감한 문집이라 더 쓰거나 고칠 수 없어요.");
        Contributor writer = AnthologyService.requireContributor(anthology, token);

        Essay essay = essayRepository.findByAnthologyIdAndContributorId(anthology.id(), writer.id()).orElse(null);
        if (essay == null) {
            essay = essayRepository.save(Essay.start(anthology.id(), writer.id(), now()));
            activityLog.record(anthology.id(), writer.id(), ActivityType.FIRST_SAVED, essay.id());
        }
        boolean wasSubmitted = essay.isSubmitted();
        essay.revise(title, quote, body, now());
        if (submit) {
            essay.submit(now());
        }
        essayRepository.update(essay);
        if (!wasSubmitted && essay.isSubmitted()) {
            activityLog.record(anthology.id(), writer.id(), ActivityType.SUBMITTED, essay.id());
            events.publishEvent(new EssayEvents.Submitted(anthology.code(), writer.id(), essay.id()));
        }
        return essay;
    }

    /** 독후감 한 편을 읽는다. 남의 글이면 "읽음"을 기록한다. */
    @Transactional
    public Reading read(String code, String token, Long essayId) {
        Anthology anthology = anthologyService.get(code);
        Contributor viewer = AnthologyService.requireContributor(anthology, token);
        Shelf shelf = shelf(anthology);
        Essay essay = readable(shelf, viewer, essayId);
        if (!essay.isWrittenBy(viewer.id())) {
            activityLog.record(anthology.id(), viewer.id(), ActivityType.READ_OTHERS, essay.id());
        }
        return new Reading(shelf, viewer, essay);
    }

    @Transactional
    public Reply reply(String code, String token, Long essayId, String body) {
        Anthology anthology = anthologyService.get(code);
        Contributor viewer = AnthologyService.requireContributor(anthology, token);
        Shelf shelf = shelf(anthology);
        Essay essay = readable(shelf, viewer, essayId);
        Reply reply = replyRepository.save(Reply.to(essay, viewer.id(), body, now()));
        events.publishEvent(new EssayEvents.Replied(anthology.code(), essay.id(), essay.contributorId(), viewer.id(),
                reply.body()));
        return reply;
    }

    /** 모집을 마감한다. 엮은이만, 제출된 독후감이 두 편 이상일 때. */
    @Transactional
    public void close(String code, String token) {
        Anthology anthology = locked(code);
        Contributor requester = AnthologyService.requireContributor(anthology, token);
        anthology.close(requester, shelf(anthology).submittedCount(), now());
        anthologyRepository.markClosed(anthology);
        events.publishEvent(new EssayEvents.Closed(anthology.code()));
    }

    @Transactional
    public void changeInclusion(String code, String token, Long essayId, boolean included) {
        Anthology anthology = anthologyService.get(code);
        if (!anthology.isClosed()) {
            throw DomainException.rule("책에 넣을 글은 마감한 뒤에 고를 수 있어요.");
        }
        Contributor requester = AnthologyService.requireContributor(anthology, token);
        Essay essay = essayOf(anthology, essayId);
        essay.changeInclusion(requester.id(), included);
        essayRepository.update(essay);
    }

    @Transactional
    public void allowPublicSample(String code, String token, Long essayId, boolean allowed) {
        Anthology anthology = anthologyService.get(code);
        Contributor requester = AnthologyService.requireContributor(anthology, token);
        Essay essay = essayOf(anthology, essayId);
        essay.allowPublicSample(requester.id(), allowed);
        essayRepository.update(essay);
    }

    /** 엮은이가 책 속 순서를 한 칸 옮긴다. */
    @Transactional
    public void move(String code, String token, Long essayId, int delta) {
        Anthology anthology = locked(code);
        Contributor requester = AnthologyService.requireContributor(anthology, token);
        for (Essay changed : shelf(anthology).move(requester, essayId, delta)) {
            essayRepository.update(changed);
        }
    }

    /** 엮은이가 참여자를 내보낸다. 그 사람의 글·답글·기록도 함께 지운다. */
    @Transactional
    public String remove(String code, String token, Long contributorId) {
        Anthology anthology = locked(code);
        Contributor removed = anthology.remove(AnthologyService.requireContributor(anthology, token), contributorId);
        replyRepository.deleteAllAround(removed.id());
        essayRepository.deleteByContributor(removed.id());
        activityLog.forgetContributor(removed.id());
        anthologyRepository.deleteContributor(removed.id());
        return removed.nickname();
    }

    @Transactional(readOnly = true)
    public Shelf shelf(Anthology anthology) {
        List<Essay> essays = essayRepository.findByAnthologyId(anthology.id());
        List<Long> essayIds = essays.stream().map(Essay::id).toList();
        Map<Long, List<Reply>> replies = replyRepository.findByEssayIds(essayIds).stream()
                .collect(Collectors.groupingBy(Reply::essayId));
        return new Shelf(anthology, essays, replies);
    }

    /** 참여 → 써 봄 → 제출 → 남의 글 읽음 → 내려받음. 엮은이 화면에 보여 준다. */
    @Transactional(readOnly = true)
    public Funnel funnel(Shelf shelf) {
        Anthology anthology = shelf.anthology();
        return new Funnel(anthology.contributors().size(), shelf.essays().size(), shelf.submittedCount(),
                activityLog.engagement(anthology.id()));
    }

    /** 읽을 수 있는 독후감을 꺼낸다. 없으면 404, 아직 못 읽으면 403. */
    public static Essay readable(Shelf shelf, Contributor viewer, Long essayId) {
        Essay essay = shelf.findById(essayId)
                .orElseThrow(() -> DomainException.notFound("독후감을 찾을 수 없어요."));
        if (!shelf.canRead(viewer, essay)) {
            throw DomainException.forbidden("내 독후감을 먼저 제출하면 다른 사람의 글을 읽을 수 있어요.");
        }
        return essay;
    }

    private Essay essayOf(Anthology anthology, Long essayId) {
        return shelf(anthology).findById(essayId)
                .orElseThrow(() -> DomainException.notFound("독후감을 찾을 수 없어요."));
    }

    private Anthology locked(String code) {
        return anthologyRepository.lockByCode(code)
                .orElseThrow(() -> DomainException.notFound("문집을 찾을 수 없어요."));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    /** 읽기 화면에 필요한 것: 책장(앞뒤 글), 읽는 사람, 글. */
    public record Reading(Shelf shelf, Contributor viewer, Essay essay) {
    }
}
