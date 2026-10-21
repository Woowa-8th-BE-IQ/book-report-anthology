package com.iq.anthology.essay;

import com.iq.anthology.support.DomainException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcEssayRepository implements EssayRepository {

    private final JdbcClient jdbc;

    public JdbcEssayRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Essay save(Essay essay) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        try {
            jdbc.sql("""
                            INSERT INTO essay (anthology_id, contributor_id, title, quote, body, status,
                                               included_in_book, created_at, updated_at, submitted_at)
                            VALUES (:anthologyId, :contributorId, :title, :quote, :body, :status,
                                    :includedInBook, :createdAt, :updatedAt, :submittedAt)
                            """)
                    .param("anthologyId", essay.anthologyId())
                    .param("contributorId", essay.contributorId())
                    .param("title", essay.title())
                    .param("quote", essay.quote())
                    .param("body", essay.body())
                    .param("status", essay.status().name())
                    .param("includedInBook", essay.includedInBook())
                    .param("createdAt", essay.createdAt())
                    .param("updatedAt", essay.updatedAt())
                    .param("submittedAt", essay.submittedAt())
                    .update(keyHolder, "id");
        } catch (DuplicateKeyException e) {
            throw DomainException.conflict("이미 쓰고 있는 독후감이 있어요. 새로고침해 주세요.");
        }
        essay.assignId(keyHolder.getKeyAs(Long.class));
        return essay;
    }

    @Override
    public void update(Essay essay) {
        jdbc.sql("""
                        UPDATE essay
                           SET title = :title, quote = :quote, body = :body, status = :status,
                               included_in_book = :includedInBook, updated_at = :updatedAt,
                               submitted_at = :submittedAt, book_order = :bookOrder, public_sample = :publicSample
                         WHERE id = :id
                        """)
                .param("title", essay.title())
                .param("quote", essay.quote())
                .param("body", essay.body())
                .param("status", essay.status().name())
                .param("includedInBook", essay.includedInBook())
                .param("updatedAt", essay.updatedAt())
                .param("submittedAt", essay.submittedAt())
                .param("bookOrder", essay.bookOrder())
                .param("publicSample", essay.publicSample())
                .param("id", essay.id())
                .update();
    }

    @Override
    public Optional<Essay> findByAnthologyIdAndContributorId(Long anthologyId, Long contributorId) {
        return jdbc.sql("SELECT * FROM essay WHERE anthology_id = :anthologyId AND contributor_id = :contributorId")
                .param("anthologyId", anthologyId)
                .param("contributorId", contributorId)
                .query(this::row)
                .optional();
    }

    @Override
    public List<Essay> findByAnthologyId(Long anthologyId) {
        return jdbc.sql("SELECT * FROM essay WHERE anthology_id = :anthologyId ORDER BY id")
                .param("anthologyId", anthologyId)
                .query(this::row)
                .list();
    }

    @Override
    public void deleteByContributor(Long contributorId) {
        jdbc.sql("DELETE FROM essay WHERE contributor_id = :contributorId")
                .param("contributorId", contributorId)
                .update();
    }

    private Essay row(ResultSet rs, int rowNum) throws SQLException {
        return new Essay(
                rs.getLong("id"),
                rs.getLong("anthology_id"),
                rs.getLong("contributor_id"),
                rs.getString("title"),
                rs.getString("quote"),
                rs.getString("body"),
                EssayStatus.valueOf(rs.getString("status")),
                rs.getBoolean("included_in_book"),
                rs.getObject("created_at", LocalDateTime.class),
                rs.getObject("updated_at", LocalDateTime.class),
                rs.getObject("submitted_at", LocalDateTime.class),
                rs.getObject("book_order", Integer.class),
                rs.getBoolean("public_sample"));
    }
}
