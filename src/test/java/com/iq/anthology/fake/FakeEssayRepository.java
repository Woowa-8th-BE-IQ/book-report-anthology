package com.iq.anthology.fake;

import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.EssayRepository;
import com.iq.anthology.support.DomainException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

/** 메모리 저장소. 사본을 돌려주고, (문집, 참여자) 유일 제약을 흉내 낸다. */
public class FakeEssayRepository implements EssayRepository {

    private final Map<Long, Essay> rows = new LinkedHashMap<>();
    private final AtomicLong ids = new AtomicLong(1);

    @Override
    public Essay save(Essay essay) {
        boolean duplicated = rows.values().stream().anyMatch(existing ->
                Objects.equals(existing.anthologyId(), essay.anthologyId())
                        && Objects.equals(existing.contributorId(), essay.contributorId()));
        if (duplicated) {
            throw DomainException.conflict("이미 쓰고 있는 독후감");
        }
        essay.assignId(ids.getAndIncrement());
        rows.put(essay.id(), copy(essay));
        return essay;
    }

    @Override
    public void update(Essay essay) {
        rows.put(essay.id(), copy(essay));
    }

    @Override
    public Optional<Essay> findByAnthologyIdAndContributorId(Long anthologyId, Long contributorId) {
        return rows.values().stream()
                .filter(essay -> essay.anthologyId().equals(anthologyId) && essay.contributorId().equals(contributorId))
                .findFirst()
                .map(FakeEssayRepository::copy);
    }

    @Override
    public List<Essay> findByAnthologyId(Long anthologyId) {
        return rows.values().stream()
                .filter(essay -> essay.anthologyId().equals(anthologyId))
                .map(FakeEssayRepository::copy)
                .toList();
    }

    @Override
    public void deleteByContributor(Long contributorId) {
        rows.values().removeIf(essay -> essay.contributorId().equals(contributorId));
    }

    private static Essay copy(Essay e) {
        return new Essay(e.id(), e.anthologyId(), e.contributorId(), e.title(), e.quote(), e.body(), e.status(),
                e.includedInBook(), e.createdAt(), e.updatedAt(), e.submittedAt(), e.bookOrder(), e.publicSample());
    }
}
