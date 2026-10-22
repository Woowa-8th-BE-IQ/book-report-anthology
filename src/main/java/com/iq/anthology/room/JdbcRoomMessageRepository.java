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

    @Override
    public void startReading(Long anthologyId, Long contributorId) {
        jdbc.sql("""
                        UPDATE contributor
                           SET last_read_message_id = COALESCE(
                               (SELECT MAX(id) FROM room_message WHERE anthology_id = :anthologyId), 0)
                         WHERE id = :contributorId AND last_read_message_id IS NULL
                        """)
                .param("anthologyId", anthologyId)
                .param("contributorId", contributorId)
                .update();
    }

    @Override
    public void markRead(Long contributorId, Long messageId) {
        jdbc.sql("""
                        UPDATE contributor SET last_read_message_id = :messageId
                         WHERE id = :contributorId
                           AND (last_read_message_id IS NULL OR last_read_message_id < :messageId)
                        """)
                .param("contributorId", contributorId)
                .param("messageId", messageId)
                .update();
    }

    @Override
    public long lastRead(Long contributorId) {
        return jdbc.sql("SELECT COALESCE(last_read_message_id, 0) FROM contributor WHERE id = :contributorId")
                .param("contributorId", contributorId)
                .query(Long.class)
                .optional()
                .orElse(0L);
    }

    @Override
    public int unreadCount(Long anthologyId, Long contributorId) {
        return jdbc.sql("""
                        SELECT COUNT(*) FROM room_message m
                         WHERE m.anthology_id = :anthologyId
                           AND m.contributor_id <> :contributorId
                           AND m.id > (SELECT COALESCE(last_read_message_id, 0) FROM contributor
                                        WHERE id = :contributorId)
                        """)
                .param("anthologyId", anthologyId)
                .param("contributorId", contributorId)
                .query(Integer.class)
                .single();
    }

    @Override
    public boolean markNudged(Long contributorId, java.time.LocalDate today) {
        return jdbc.sql("""
                        UPDATE contributor SET nudged_on = :today
                         WHERE id = :contributorId AND (nudged_on IS NULL OR nudged_on < :today)
                        """)
                .param("contributorId", contributorId)
                .param("today", today)
                .update() == 1;
    }
}
