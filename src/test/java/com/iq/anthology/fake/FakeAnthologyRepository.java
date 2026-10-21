package com.iq.anthology.fake;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyRepository;
import com.iq.anthology.anthology.AnthologyStatus;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.support.DomainException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 메모리 저장소. 꺼낼 때마다 사본을 돌려준다. 실제 DB처럼 "저장하지 않은 변경은 사라진다"를 재현해서,
 * 서비스가 update 호출을 빠뜨리면 테스트가 잡아낸다.
 */
public class FakeAnthologyRepository implements AnthologyRepository {

    private final Map<Long, Anthology> rows = new LinkedHashMap<>();
    private final AtomicLong anthologyIds = new AtomicLong(1);
    private final AtomicLong contributorIds = new AtomicLong(1);

    @Override
    public Anthology save(Anthology anthology) {
        anthology.assignId(anthologyIds.getAndIncrement());
        for (Contributor contributor : anthology.contributors()) {
            contributor.assignId(contributorIds.getAndIncrement());
        }
        rows.put(anthology.id(), copy(anthology, anthology.contributors()));
        return anthology;
    }

    @Override
    public Contributor addContributor(Long anthologyId, Contributor contributor) {
        Anthology stored = rows.get(anthologyId);
        boolean duplicated = stored.contributors().stream().anyMatch(existing ->
                existing.joinOrder() == contributor.joinOrder() || existing.nickname().equals(contributor.nickname()));
        if (duplicated) {
            throw DomainException.conflict("중복 참여");
        }
        contributor.assignId(contributorIds.getAndIncrement());
        List<Contributor> contributors = new ArrayList<>(stored.contributors());
        contributors.add(contributor);
        rows.put(anthologyId, copy(stored, contributors));
        return contributor;
    }

    @Override
    public void updateTexts(Anthology anthology) {
        Anthology stored = rows.get(anthology.id());
        rows.put(anthology.id(), new Anthology(stored.id(), stored.code(), stored.title(), stored.bookTitle(),
                stored.bookAuthor(), anthology.introduction(), anthology.promptsText(), anthology.appendix(),
                stored.dueDate(), stored.status(), stored.createdAt(), stored.closedAt(), stored.contributors()));
    }

    @Override
    public void updateToken(Contributor contributor) {
        rows.replaceAll((id, stored) -> copy(stored, stored.contributors().stream()
                .map(c -> c.id().equals(contributor.id())
                        ? new Contributor(c.id(), c.nickname(), c.realName(), contributor.token(), c.joinOrder(),
                        c.joinedAt(), c.lastSeenAt())
                        : c)
                .toList()));
    }

    @Override
    public void touch(Long contributorId, java.time.LocalDateTime now) {
        rows.replaceAll((id, stored) -> copy(stored, stored.contributors().stream()
                .map(c -> c.id().equals(contributorId)
                        ? new Contributor(c.id(), c.nickname(), c.realName(), c.token(), c.joinOrder(), c.joinedAt(),
                        now)
                        : c)
                .toList()));
    }

    @Override
    public void deleteContributor(Long contributorId) {
        rows.replaceAll((id, stored) -> copy(stored, stored.contributors().stream()
                .filter(c -> !c.id().equals(contributorId))
                .toList()));
    }

    @Override
    public void markClosed(Anthology anthology) {
        Anthology stored = rows.get(anthology.id());
        if (stored.status() != AnthologyStatus.COLLECTING) {
            throw DomainException.conflict("이미 마감");
        }
        rows.put(anthology.id(), new Anthology(stored.id(), stored.code(), stored.title(), stored.bookTitle(),
                stored.bookAuthor(), stored.introduction(), stored.promptsText(), stored.appendix(),
                stored.dueDate(), anthology.status(), stored.createdAt(), anthology.closedAt(),
                stored.contributors()));
    }

    @Override
    public Optional<Anthology> findByCode(String code) {
        return rows.values().stream()
                .filter(anthology -> anthology.code().equals(code))
                .findFirst()
                .map(anthology -> copy(anthology, anthology.contributors()));
    }

    @Override
    public Optional<Anthology> lockByCode(String code) {
        return findByCode(code);
    }

    @Override
    public Optional<Anthology> findByContributorToken(String token) {
        return rows.values().stream()
                .filter(anthology -> anthology.findByToken(token).isPresent())
                .findFirst()
                .map(anthology -> copy(anthology, anthology.contributors()));
    }

    @Override
    public boolean existsByCode(String code) {
        return findByCode(code).isPresent();
    }

    private static Anthology copy(Anthology source, List<Contributor> contributors) {
        List<Contributor> copies = contributors.stream()
                .map(c -> new Contributor(c.id(), c.nickname(), c.realName(), c.token(), c.joinOrder(), c.joinedAt(),
                        c.lastSeenAt()))
                .toList();
        return new Anthology(source.id(), source.code(), source.title(), source.bookTitle(), source.bookAuthor(),
                source.introduction(), source.promptsText(), source.appendix(), source.dueDate(), source.status(),
                source.createdAt(), source.closedAt(), copies);
    }
}
