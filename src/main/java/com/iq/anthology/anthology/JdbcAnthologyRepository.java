package com.iq.anthology.anthology;

import com.iq.anthology.support.DomainException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAnthologyRepository implements AnthologyRepository {

    private final JdbcClient jdbc;

    public JdbcAnthologyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Anthology save(Anthology anthology) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.sql("""
                        INSERT INTO anthology (code, title, book_title, book_author, introduction, due_date,
                                               status, created_at, closed_at)
                        VALUES (:code, :title, :bookTitle, :bookAuthor, :introduction, :dueDate,
                                :status, :createdAt, :closedAt)
                        """)
                .param("code", anthology.code())
                .param("title", anthology.title())
                .param("bookTitle", anthology.bookTitle())
                .param("bookAuthor", anthology.bookAuthor())
                .param("introduction", anthology.introduction())
                .param("dueDate", anthology.dueDate())
                .param("status", anthology.status().name())
                .param("createdAt", anthology.createdAt())
                .param("closedAt", anthology.closedAt())
                .update(keyHolder, "id");
        anthology.assignId(keyHolder.getKeyAs(Long.class));
        for (Contributor contributor : anthology.contributors()) {
            addContributor(anthology.id(), contributor);
        }
        return anthology;
    }

    @Override
    public Contributor addContributor(Long anthologyId, Contributor contributor) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        try {
            jdbc.sql("""
                            INSERT INTO contributor (anthology_id, nickname, real_name, token, join_order, joined_at)
                            VALUES (:anthologyId, :nickname, :realName, :token, :joinOrder, :joinedAt)
                            """)
                    .param("anthologyId", anthologyId)
                    .param("nickname", contributor.nickname())
                    .param("realName", contributor.realName())
                    .param("token", contributor.token())
                    .param("joinOrder", contributor.joinOrder())
                    .param("joinedAt", contributor.joinedAt())
                    .update(keyHolder, "id");
        } catch (DuplicateKeyException e) {
            throw DomainException.conflict("방금 같은 닉네임이나 순서로 누가 먼저 들어왔어요. 다시 시도해 주세요.");
        }
        contributor.assignId(keyHolder.getKeyAs(Long.class));
        return contributor;
    }

    @Override
    public void updateIntroduction(Anthology anthology) {
        jdbc.sql("UPDATE anthology SET introduction = :introduction WHERE id = :id")
                .param("introduction", anthology.introduction())
                .param("id", anthology.id())
                .update();
    }

    @Override
    public void markClosed(Anthology anthology) {
        int updated = jdbc.sql("""
                        UPDATE anthology SET status = :status, closed_at = :closedAt
                         WHERE id = :id AND status = 'COLLECTING'
                        """)
                .param("status", anthology.status().name())
                .param("closedAt", anthology.closedAt())
                .param("id", anthology.id())
                .update();
        if (updated == 0) {
            throw DomainException.conflict("이미 마감된 문집이에요.");
        }
    }

    @Override
    public Optional<Anthology> findByCode(String code) {
        return jdbc.sql("SELECT * FROM anthology WHERE code = :code")
                .param("code", code)
                .query(this::row)
                .optional()
                .map(this::withContributors);
    }

    @Override
    public Optional<Anthology> lockByCode(String code) {
        return jdbc.sql("SELECT * FROM anthology WHERE code = :code FOR UPDATE")
                .param("code", code)
                .query(this::row)
                .optional()
                .map(this::withContributors);
    }

    @Override
    public Optional<Anthology> findByContributorToken(String token) {
        return jdbc.sql("""
                        SELECT a.* FROM anthology a
                          JOIN contributor c ON c.anthology_id = a.id
                         WHERE c.token = :token
                        """)
                .param("token", token)
                .query(this::row)
                .optional()
                .map(this::withContributors);
    }

    @Override
    public boolean existsByCode(String code) {
        return jdbc.sql("SELECT COUNT(*) FROM anthology WHERE code = :code")
                .param("code", code)
                .query(Long.class)
                .single() > 0;
    }

    private Anthology withContributors(Row row) {
        List<Contributor> contributors = jdbc.sql("""
                        SELECT * FROM contributor WHERE anthology_id = :anthologyId ORDER BY join_order
                        """)
                .param("anthologyId", row.id())
                .query((rs, rowNum) -> new Contributor(
                        rs.getLong("id"),
                        rs.getString("nickname"),
                        rs.getString("real_name"),
                        rs.getString("token"),
                        rs.getInt("join_order"),
                        rs.getObject("joined_at", LocalDateTime.class)))
                .list();
        return new Anthology(row.id(), row.code(), row.title(), row.bookTitle(), row.bookAuthor(),
                row.introduction(), row.dueDate(), row.status(), row.createdAt(), row.closedAt(), contributors);
    }

    private Row row(ResultSet rs, int rowNum) throws SQLException {
        return new Row(
                rs.getLong("id"),
                rs.getString("code"),
                rs.getString("title"),
                rs.getString("book_title"),
                rs.getString("book_author"),
                rs.getString("introduction"),
                rs.getObject("due_date", LocalDate.class),
                AnthologyStatus.valueOf(rs.getString("status")),
                rs.getObject("created_at", LocalDateTime.class),
                rs.getObject("closed_at", LocalDateTime.class));
    }

    private record Row(Long id, String code, String title, String bookTitle, String bookAuthor,
                       String introduction, LocalDate dueDate, AnthologyStatus status,
                       LocalDateTime createdAt, LocalDateTime closedAt) {
    }
}
