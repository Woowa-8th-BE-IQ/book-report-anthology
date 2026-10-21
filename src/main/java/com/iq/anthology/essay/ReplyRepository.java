package com.iq.anthology.essay;

import java.util.Collection;
import java.util.List;

public interface ReplyRepository {

    Reply save(Reply reply);

    List<Reply> findByEssayIds(Collection<Long> essayIds);

    /** 이 사람이 쓴 답글과, 이 사람의 글에 달린 답글을 모두 지운다. */
    void deleteAllAround(Long contributorId);
}
