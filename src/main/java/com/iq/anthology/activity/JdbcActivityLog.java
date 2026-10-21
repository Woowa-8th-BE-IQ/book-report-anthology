package com.iq.anthology.activity;

import java.time.Clock;
import java.time.LocalDateTime;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcActivityLog implements ActivityLog {

    private final JdbcClient jdbc;
    private final Clock clock;

    public JdbcActivityLog(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Override
    public void record(Long anthologyId, Long contributorId, ActivityType type, Long essayId) {
        jdbc.sql("""
                        INSERT INTO activity (anthology_id, contributor_id, kind, essay_id, created_at)
                        VALUES (:anthologyId, :contributorId, :kind, :essayId, :createdAt)
                        """)
                .param("anthologyId", anthologyId)
                .param("contributorId", contributorId)
                .param("kind", type.name())
                .param("essayId", essayId)
                .param("createdAt", LocalDateTime.now(clock))
                .update();
    }

    @Override
    public Engagement engagement(Long anthologyId) {
        long readers = count("""
                SELECT COUNT(DISTINCT contributor_id) FROM activity
                 WHERE anthology_id = :anthologyId AND kind = 'READ_OTHERS'
                """, anthologyId);
        long readPairs = count("""
                SELECT COUNT(*) FROM (
                    SELECT DISTINCT contributor_id, essay_id FROM activity
                     WHERE anthology_id = :anthologyId AND kind = 'READ_OTHERS'
                ) pairs
                """, anthologyId);
        long downloaded = count("""
                SELECT COUNT(DISTINCT contributor_id) FROM activity
                 WHERE anthology_id = :anthologyId AND kind IN ('EPUB_DOWNLOADED', 'PDF_DOWNLOADED')
                """, anthologyId);
        long aboutViews = count("""
                SELECT COUNT(*) FROM activity
                 WHERE anthology_id = :anthologyId AND kind = 'ABOUT_VIEWED'
                """, anthologyId);
        return new Engagement(readers, readPairs, downloaded, aboutViews);
    }

    private long count(String sql, Long anthologyId) {
        return jdbc.sql(sql).param("anthologyId", anthologyId).query(Long.class).single();
    }

    @Override
    public void forgetContributor(Long contributorId) {
        jdbc.sql("DELETE FROM activity WHERE contributor_id = :contributorId")
                .param("contributorId", contributorId)
                .update();
    }
}
