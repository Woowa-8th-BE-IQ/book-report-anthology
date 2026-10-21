package com.iq.anthology.room;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcRoomMessageRepository implements RoomMessageRepository {

    private final JdbcClient jdbc;

    public JdbcRoomMessageRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public RoomMessage save(RoomMessage message) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.sql("""
                        INSERT INTO room_message (anthology_id, contributor_id, body, created_at)
                        VALUES (:anthologyId, :contributorId, :body, :createdAt)
                        """)
                .param("anthologyId", message.anthologyId())
                .param("contributorId", message.contributorId())
                .param("body", message.body())
                .param("createdAt", message.createdAt())
                .update(keyHolder, "id");
        message.assignId(keyHolder.getKeyAs(Long.class));
        return message;
    }

    @Override
    public List<RoomMessage> recent(Long anthologyId, int limit) {
        List<RoomMessage> newestFirst = jdbc.sql("""
                        SELECT * FROM room_message WHERE anthology_id = :anthologyId
                         ORDER BY id DESC LIMIT :limit
                        """)
                .param("anthologyId", anthologyId)
                .param("limit", limit)
                .query((rs, rowNum) -> new RoomMessage(
                        rs.getLong("id"),
                        rs.getLong("anthology_id"),
                        rs.getLong("contributor_id"),
                        rs.getString("body"),
                        rs.getObject("created_at", LocalDateTime.class)))
                .list();
        List<RoomMessage> oldestFirst = new ArrayList<>(newestFirst);
        Collections.reverse(oldestFirst);
        return oldestFirst;
    }

    @Override
    public void deleteByContributor(Long contributorId) {
        jdbc.sql("DELETE FROM room_message WHERE contributor_id = :contributorId")
                .param("contributorId", contributorId)
                .update();
    }
}
