package com.iq.anthology.essay;

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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EssayService {

    private final AnthologyService anthologyService;
    private final AnthologyRepository anthologyRepository;
    private final EssayRepository essayRepository;
    private final ReplyRepository replyRepository;
    private final Clock clock;

    public EssayService(AnthologyService anthologyService, AnthologyRepository anthologyRepository,
                        EssayRepository essayRepository, ReplyRepository replyRepository, Clock clock) {
        this.anthologyService = anthologyService;
        this.anthologyRepository = anthologyRepository;
        this.essayRepository = essayRepository;
        this.replyRepository = replyRepository;
        this.clock = clock;
    }

    /** 내 독후감을 저장한다. submit이면 제출까지 한다. 첫 저장이면 새로 만든다. */
    @Transactional
    public Essay save(String code, String token, String title, String quote, String body, boolean submit) {
        Anthology anthology = locked(code);
        anthology.requireCollecting("마감한 문집이라 더 쓰거나 고칠 수 없어요.");
        Contributor writer = AnthologyService.requireContributor(anthology, token);

        Essay essay = essayRepository.findByAnthologyIdAndContributorId(anthology.id(), writer.id())
                .orElseGet(() -> essayRepository.save(Essay.start(anthology.id(), writer.id(), now())));
        essay.revise(title, quote, body, now());
        if (submit) {
            essay.submit(now());
        }
        essayRepository.update(essay);
        return essay;
    }

    @Transactional
    public Reply reply(String code, String token, Long essayId, String body) {
        Anthology anthology = anthologyService.get(code);
        Contributor viewer = AnthologyService.requireContributor(anthology, token);
        Shelf shelf = shelf(anthology);
        Essay essay = readable(shelf, viewer, essayId);
        return replyRepository.save(Reply.to(essay, viewer.id(), body, now()));
    }

    /** 모집을 마감한다. 엮은이만, 제출된 독후감이 두 편 이상일 때. */
    @Transactional
    public void close(String code, String token) {
        Anthology anthology = locked(code);
        Contributor requester = AnthologyService.requireContributor(anthology, token);
        anthology.close(requester, shelf(anthology).submittedCount(), now());
        anthologyRepository.markClosed(anthology);
    }

    @Transactional
    public void changeInclusion(String code, String token, Long essayId, boolean included) {
        Anthology anthology = anthologyService.get(code);
        if (!anthology.isClosed()) {
            throw DomainException.rule("책에 넣을 글은 마감한 뒤에 고를 수 있어요.");
        }
        Contributor requester = AnthologyService.requireContributor(anthology, token);
        Essay essay = shelf(anthology).findById(essayId)
                .orElseThrow(() -> DomainException.notFound("독후감을 찾을 수 없어요."));
        essay.changeInclusion(requester.id(), included);
        essayRepository.update(essay);
    }

    @Transactional(readOnly = true)
    public Shelf shelf(Anthology anthology) {
        List<Essay> essays = essayRepository.findByAnthologyId(anthology.id());
        List<Long> essayIds = essays.stream().map(Essay::id).toList();
        Map<Long, List<Reply>> replies = replyRepository.findByEssayIds(essayIds).stream()
                .collect(Collectors.groupingBy(Reply::essayId));
        return new Shelf(anthology, essays, replies);
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

    private Anthology locked(String code) {
        return anthologyRepository.lockByCode(code)
                .orElseThrow(() -> DomainException.notFound("문집을 찾을 수 없어요."));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }
}
