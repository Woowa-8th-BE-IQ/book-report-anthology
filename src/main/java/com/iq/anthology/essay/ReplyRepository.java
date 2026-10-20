package com.iq.anthology.essay;

import java.util.Collection;
import java.util.List;

public interface ReplyRepository {

    Reply save(Reply reply);

    List<Reply> findByEssayIds(Collection<Long> essayIds);
}
