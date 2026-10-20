package com.iq.anthology.essay;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcReplyRepository implements ReplyRepository {

    private final JdbcClient jdbc;

    public JdbcReplyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Reply save(Reply reply) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.sql("""
                        INSERT INTO reply (essay_id, contributor_id, body, created_at)
                        VALUES (:essayId, :contributorId, :body, :createdAt)
                        """)
                .param("essayId", reply.essayId())
                .param("contributorId", reply.contributorId())
                .param("body", reply.body())
                .param("createdAt", reply.createdAt())
                .update(keyHolder, "id");
        reply.assignId(keyHolder.getKeyAs(Long.class));
        return reply;
    }

    @Override
    public List<Reply> findByEssayIds(Collection<Long> essayIds) {
        if (essayIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT * FROM reply WHERE essay_id IN (:essayIds) ORDER BY created_at, id")
                .param("essayIds", essayIds)
                .query((rs, rowNum) -> new Reply(
                        rs.getLong("id"),
                        rs.getLong("essay_id"),
                        rs.getLong("contributor_id"),
                        rs.getString("body"),
                        rs.getObject("created_at", LocalDateTime.class)))
                .list();
    }
}
