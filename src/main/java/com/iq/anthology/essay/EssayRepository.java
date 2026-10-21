package com.iq.anthology.essay;

import java.util.List;
import java.util.Optional;

public interface EssayRepository {

    /** 새 독후감을 저장한다. 같은 사람이 같은 문집에 이미 썼으면 충돌(409)이다. */
    Essay save(Essay essay);

    void update(Essay essay);

    Optional<Essay> findByAnthologyIdAndContributorId(Long anthologyId, Long contributorId);

    List<Essay> findByAnthologyId(Long anthologyId);

    void deleteByContributor(Long contributorId);
}
