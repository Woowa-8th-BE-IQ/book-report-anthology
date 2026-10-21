package com.iq.anthology.essay;

import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.Texts;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 한 사람의 독후감. 문집 하나에 한 사람당 한 편이다.
 *
 * <p>초안은 비어 있어도 저장할 수 있다. 분량 규칙은 제출할 때 따진다.
 */
public class Essay {

    public static final int TITLE_MAX = 60;
    /** 저작권법 제28조의 정당한 범위 인용을 지키기 위한 제품 상한. */
    public static final int QUOTE_MAX = 150;
    public static final int BODY_MIN = 200;
    public static final int BODY_MAX = 30_000;

    private Long id;
    private final Long anthologyId;
    private final Long contributorId;
    private String title;
    private String quote;
    private String body;
    private EssayStatus status;
    private boolean includedInBook;
    private final LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime submittedAt;
    /** 엮은이가 정한 책 속 순서. 비어 있으면 닉네임 가나다순. */
    private Integer bookOrder;
    /** 공개 소개 페이지에 맛보기로 보여도 된다는 쓴 사람의 동의. */
    private boolean publicSample;

    public Essay(Long id, Long anthologyId, Long contributorId, String title, String quote, String body,
                 EssayStatus status, boolean includedInBook, LocalDateTime createdAt, LocalDateTime updatedAt,
                 LocalDateTime submittedAt) {
        this(id, anthologyId, contributorId, title, quote, body, status, includedInBook, createdAt, updatedAt,
                submittedAt, null, false);
    }

    public Essay(Long id, Long anthologyId, Long contributorId, String title, String quote, String body,
                 EssayStatus status, boolean includedInBook, LocalDateTime createdAt, LocalDateTime updatedAt,
                 LocalDateTime submittedAt, Integer bookOrder, boolean publicSample) {
        this.bookOrder = bookOrder;
        this.publicSample = publicSample;
        this.id = id;
        this.anthologyId = Objects.requireNonNull(anthologyId);
        this.contributorId = Objects.requireNonNull(contributorId);
        this.title = title;
        this.quote = quote;
        this.body = body;
        this.status = Objects.requireNonNull(status);
        this.includedInBook = includedInBook;
        this.createdAt = Objects.requireNonNull(createdAt);
        this.updatedAt = Objects.requireNonNull(updatedAt);
        this.submittedAt = submittedAt;
    }

    public static Essay start(Long anthologyId, Long contributorId, LocalDateTime now) {
        return new Essay(null, anthologyId, contributorId, null, null, null, EssayStatus.DRAFT, true, now, now, null);
    }

    /** 고쳐 쓴다. 최대 길이만 지키면 된다. 제출한 글을 고치면 다시 확인해 제출 상태를 유지한다. */
    public void revise(String title, String quote, String body, LocalDateTime now) {
        String newTitle = Texts.optional(title, "제목", TITLE_MAX);
        String newQuote = Texts.optional(quote, "밑줄", QUOTE_MAX);
        String newBody = Texts.optional(body, "본문", BODY_MAX);
        if (status == EssayStatus.SUBMITTED) {
            // 이미 낸 글은 고쳐도 제출 기준을 지켜야 한다. 검증이 끝나기 전엔 아무것도 바꾸지 않는다.
            validateForSubmission(newTitle, newBody);
        }
        this.title = newTitle;
        this.quote = newQuote;
        this.body = newBody;
        this.updatedAt = now;
    }

    public void submit(LocalDateTime now) {
        validateForSubmission(title, body);
        if (status == EssayStatus.DRAFT) {
            this.status = EssayStatus.SUBMITTED;
            this.submittedAt = now;
        }
        this.updatedAt = now;
    }

    private static void validateForSubmission(String title, String body) {
        Texts.required(title, "제목", 1, TITLE_MAX);
        Texts.required(body, "본문", BODY_MIN, BODY_MAX);
    }

    /** 마감 뒤 책에 넣을지 정한다. 본인만 바꿀 수 있다. */
    public void changeInclusion(Long requesterId, boolean included) {
        if (!isWrittenBy(requesterId)) {
            throw DomainException.forbidden("본인 글만 책에서 빼거나 넣을 수 있어요.");
        }
        this.includedInBook = included;
    }

    /** 공개 소개 페이지에 이 글을 맛보기로 보여도 되는지. 쓴 사람만, 제출한 글만. */
    public void allowPublicSample(Long requesterId, boolean allowed) {
        if (!isWrittenBy(requesterId)) {
            throw DomainException.forbidden("본인 글만 공개 여부를 정할 수 있어요.");
        }
        if (!isSubmitted()) {
            throw DomainException.rule("제출한 글만 공개할 수 있어요.");
        }
        this.publicSample = allowed;
    }

    /** 책 속 순서를 정한다. 엮은이의 순서 조정({@link Shelf#move})에서만 쓴다. */
    void placeAt(int order) {
        this.bookOrder = order;
    }

    /** 읽는 데 걸리는 대략의 분. 한국어 산문 기준 1분에 500자. */
    public int readingMinutes() {
        return Math.max(1, Math.round(bodyLength() / 500f));
    }

    public boolean isWrittenBy(Long candidateId) {
        return Objects.equals(contributorId, candidateId);
    }

    public boolean isSubmitted() {
        return status == EssayStatus.SUBMITTED;
    }

    /** 본문 글자 수 (코드 포인트 기준) */
    public int bodyLength() {
        return Texts.length(body);
    }

    public void assignId(Long id) {
        if (this.id != null) {
            throw new IllegalStateException("이미 저장된 독후감입니다.");
        }
        this.id = id;
    }

    public Long id() {
        return id;
    }

    public Long anthologyId() {
        return anthologyId;
    }

    public Long contributorId() {
        return contributorId;
    }

    public String title() {
        return title;
    }

    public String quote() {
        return quote;
    }

    public String body() {
        return body;
    }

    public EssayStatus status() {
        return status;
    }

    public boolean includedInBook() {
        return includedInBook;
    }

    public LocalDateTime createdAt() {
        return createdAt;
    }

    public LocalDateTime updatedAt() {
        return updatedAt;
    }

    public LocalDateTime submittedAt() {
        return submittedAt;
    }

    public Integer bookOrder() {
        return bookOrder;
    }

    public boolean publicSample() {
        return publicSample;
    }
}
