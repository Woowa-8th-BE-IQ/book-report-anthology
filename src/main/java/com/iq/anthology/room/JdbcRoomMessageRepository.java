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
        // 그 사람의 말에 달린 책갈피와 그 사람이 남긴 책갈피도 지운다
        jdbc.sql("""
                        DELETE FROM room_bookmark
                         WHERE contributor_id = :contributorId
                            OR message_id IN (SELECT id FROM room_message WHERE contributor_id = :contributorId)
                        """)
                .param("contributorId", contributorId)
                .update();
        jdbc.sql("DELETE FROM room_message WHERE contributor_id = :contributorId")
                .param("contributorId", contributorId)
                .update();
    }

    private static final org.springframework.jdbc.core.RowMapper<RoomMessage> MESSAGE = (rs, rowNum) -> new RoomMessage(
            rs.getLong("id"), rs.getLong("anthology_id"), rs.getLong("contributor_id"), rs.getString("body"),
            rs.getObject("created_at", LocalDateTime.class));

    @Override
    public List<RoomMessage> before(Long anthologyId, Long beforeId, int limit) {
        List<RoomMessage> newestFirst = jdbc.sql("""
                        SELECT * FROM room_message WHERE anthology_id = :anthologyId AND id < :beforeId
                         ORDER BY id DESC LIMIT :limit
                        """)
                .param("anthologyId", anthologyId)
                .param("beforeId", beforeId)
                .param("limit", limit)
                .query(MESSAGE)
                .list();
        List<RoomMessage> oldestFirst = new ArrayList<>(newestFirst);
        Collections.reverse(oldestFirst);
        return oldestFirst;
    }

    @Override
    public java.util.Optional<RoomMessage> findById(Long messageId) {
        return jdbc.sql("SELECT * FROM room_message WHERE id = :id").param("id", messageId).query(MESSAGE).optional();
    }

    @Override
    public boolean toggleBookmark(Long messageId, Long contributorId, LocalDateTime now) {
        int removed = jdbc.sql("DELETE FROM room_bookmark WHERE message_id = :messageId AND contributor_id = :contributorId")
                .param("messageId", messageId)
                .param("contributorId", contributorId)
                .update();
        if (removed > 0) {
            return false;
        }
        try {
            jdbc.sql("""
                            INSERT INTO room_bookmark (message_id, contributor_id, created_at)
                            VALUES (:messageId, :contributorId, :now)
                            """)
                    .param("messageId", messageId)
                    .param("contributorId", contributorId)
                    .param("now", now)
                    .update();
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // 두 번 눌러 동시에 들어왔다. 이미 켜져 있다.
        }
        return true;
    }

    @Override
    public java.util.Map<Long, List<Long>> bookmarkers(java.util.Collection<Long> messageIds) {
        java.util.Map<Long, List<Long>> result = new java.util.LinkedHashMap<>();
        if (messageIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                        SELECT message_id, contributor_id FROM room_bookmark
                         WHERE message_id IN (:ids) ORDER BY created_at, contributor_id
                        """)
                .param("ids", List.copyOf(messageIds))
                .query((rs, rowNum) -> java.util.Map.entry(rs.getLong("message_id"), rs.getLong("contributor_id")))
                .list()
                .forEach(entry -> result.computeIfAbsent(entry.getKey(), id -> new ArrayList<>()).add(entry.getValue()));
        return result;
    }

    @Override
    public List<RoomMessage> bookmarked(Long anthologyId) {
        return jdbc.sql("""
                        SELECT * FROM room_message m
                         WHERE m.anthology_id = :anthologyId
                           AND EXISTS (SELECT 1 FROM room_bookmark b WHERE b.message_id = m.id)
                         ORDER BY m.id
                        """)
                .param("anthologyId", anthologyId)
                .query(MESSAGE)
                .list();
    }

    @Override
    public java.util.Set<Long> chatOptOuts(Long anthologyId) {
        return new java.util.HashSet<>(jdbc.sql(
                        "SELECT id FROM contributor WHERE anthology_id = :anthologyId AND chat_in_book = FALSE")
                .param("anthologyId", anthologyId)
                .query(Long.class)
                .list());
    }

    @Override
    public void setChatInBook(Long contributorId, boolean include) {
        jdbc.sql("UPDATE contributor SET chat_in_book = :include WHERE id = :contributorId")
                .param("include", include)
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
