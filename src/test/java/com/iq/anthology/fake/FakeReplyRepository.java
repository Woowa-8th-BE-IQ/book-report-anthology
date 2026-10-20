package com.iq.anthology.fake;

import com.iq.anthology.essay.Reply;
import com.iq.anthology.essay.ReplyRepository;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

public class FakeReplyRepository implements ReplyRepository {

    private final List<Reply> rows = new ArrayList<>();
    private final AtomicLong ids = new AtomicLong(1);

    @Override
    public Reply save(Reply reply) {
        reply.assignId(ids.getAndIncrement());
        rows.add(reply);
        return reply;
    }

    @Override
    public List<Reply> findByEssayIds(Collection<Long> essayIds) {
        return rows.stream().filter(reply -> essayIds.contains(reply.essayId())).toList();
    }
}
