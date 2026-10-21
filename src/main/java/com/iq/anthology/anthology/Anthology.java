package com.iq.anthology.anthology;

import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.Texts;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 독후감 문집. 같은 책 한 권을 읽은 사람들이 각자 독후감 한 편씩을 써서 한 권으로 엮는다.
 *
 * <p>참여자와 모집 상태를 함께 지키는 애그리거트. 첫 참여자가 엮은이다.
 */
public class Anthology {

    public static final int MAX_CONTRIBUTORS = 100;
    /** 문집이라 부르려면 최소 두 편은 있어야 한다. */
    public static final int MIN_ESSAYS_TO_CLOSE = 2;
    public static final int INTRODUCTION_MAX = 2000;
    /** 엮은이가 던지는 글감 질문. 빈 페이지 앞에서 막히지 않게 한다. */
    public static final int PROMPTS_MAX = 3;
    public static final int PROMPT_LENGTH_MAX = 100;
    public static final int APPENDIX_MAX = 10_000;

    private Long id;
    private final String code;
    private final String title;
    private final String bookTitle;
    private final String bookAuthor;
    private String introduction;
    private String prompts;
    private String appendix;
    private final LocalDate dueDate;
    private AnthologyStatus status;
    private final LocalDateTime createdAt;
    private LocalDateTime closedAt;
    private final List<Contributor> contributors;

    public Anthology(Long id, String code, String title, String bookTitle, String bookAuthor, String introduction,
                     LocalDate dueDate, AnthologyStatus status, LocalDateTime createdAt, LocalDateTime closedAt,
                     List<Contributor> contributors) {
        this(id, code, title, bookTitle, bookAuthor, introduction, null, null, dueDate, status, createdAt, closedAt,
                contributors);
    }

    public Anthology(Long id, String code, String title, String bookTitle, String bookAuthor, String introduction,
                     String prompts, String appendix, LocalDate dueDate, AnthologyStatus status,
                     LocalDateTime createdAt, LocalDateTime closedAt, List<Contributor> contributors) {
        this.id = id;
        this.code = Objects.requireNonNull(code);
        this.title = Objects.requireNonNull(title);
        this.bookTitle = Objects.requireNonNull(bookTitle);
        this.bookAuthor = bookAuthor;
        this.introduction = introduction;
        this.prompts = prompts;
        this.appendix = appendix;
        this.dueDate = dueDate;
        this.status = Objects.requireNonNull(status);
        this.createdAt = Objects.requireNonNull(createdAt);
        this.closedAt = closedAt;
        this.contributors = new ArrayList<>(contributors);
        this.contributors.sort(Comparator.comparingInt(Contributor::joinOrder));
    }

    public static Anthology open(String code, String title, String bookTitle, String bookAuthor, LocalDate dueDate,
                                 String editorNickname, String editorRealName, String editorToken,
                                 LocalDateTime now) {
        if (dueDate != null && dueDate.isBefore(now.toLocalDate())) {
            throw DomainException.rule("마감일은 오늘 이후로 정해 주세요.");
        }
        Contributor editor = Contributor.newcomer(editorNickname, editorRealName, editorToken, 0, now);
        return new Anthology(null, code,
                Texts.required(title, "문집 제목", 1, 40),
                Texts.required(bookTitle, "책 제목", 1, 100),
                Texts.optional(bookAuthor, "지은이", 50),
                null, dueDate, AnthologyStatus.COLLECTING, now, null, List.of(editor));
    }

    public Contributor join(String nickname, String realName, String token, LocalDateTime now) {
        requireCollecting("마감한 문집에는 들어갈 수 없어요.");
        if (isFull()) {
            throw DomainException.rule("자리가 다 찼어요. (최대 " + MAX_CONTRIBUTORS + "명)");
        }
        Contributor newcomer = Contributor.newcomer(nickname, realName, token, nextJoinOrder(), now);
        if (contributors.stream().anyMatch(contributor -> contributor.nickname().equals(newcomer.nickname()))) {
            throw DomainException.conflict("같은 닉네임이 이미 있어요. 다른 닉네임을 써 주세요.");
        }
        contributors.add(newcomer);
        return newcomer;
    }

    /** 책 앞머리에 들어가는 도서 소개. 엮은이만, 마감 전까지 고칠 수 있다. */
    public void introduce(Contributor requester, String text) {
        requireEditor(requester, "도서 소개는 엮은이만 쓸 수 있어요.");
        requireCollecting("마감한 문집의 소개는 고칠 수 없어요.");
        this.introduction = Texts.optional(text, "도서 소개", INTRODUCTION_MAX);
    }

    /** 글감 질문을 정한다. 한 줄에 하나, 최대 3개. 엮은이만, 마감 전까지. */
    public void ask(Contributor requester, String text) {
        requireEditor(requester, "글감 질문은 엮은이만 정할 수 있어요.");
        requireCollecting("마감한 문집의 질문은 고칠 수 없어요.");
        List<String> lines = splitLines(text);
        if (lines.size() > PROMPTS_MAX) {
            throw DomainException.rule("질문은 " + PROMPTS_MAX + "개까지예요. (지금 " + lines.size() + "개)");
        }
        for (String line : lines) {
            Texts.optional(line, "질문 하나", PROMPT_LENGTH_MAX);
        }
        this.prompts = lines.isEmpty() ? null : String.join("\n", lines);
    }

    /** 책 끝에 붙는 부록(용어사전, 후기 등). 엮은이만. 마감 뒤에도 고칠 수 있다. */
    public void attachAppendix(Contributor requester, String text) {
        requireEditor(requester, "부록은 엮은이만 쓸 수 있어요.");
        this.appendix = Texts.optional(text, "부록", APPENDIX_MAX);
    }

    /**
     * 참여자의 개인 링크를 새로 발급한다. 링크를 잃어버린 사람을 위한 것이다. 이전 링크는 막힌다.
     * 엮은이 자신의 링크는 다시 만들 수 없다(지금 쓰는 브라우저가 바로 잠긴다).
     */
    public Contributor reissueLink(Contributor requester, Long contributorId, String newToken) {
        requireEditor(requester, "링크는 엮은이만 다시 만들 수 있어요.");
        Contributor target = contributorById(contributorId);
        if (target.isEditor()) {
            throw DomainException.rule("엮은이 본인의 링크는 다시 만들 수 없어요.");
        }
        target.reissue(newToken);
        return target;
    }

    /** 참여자를 내보낸다. 엮은이만, 모집 중일 때만. 그 사람의 글과 답글도 함께 사라진다. */
    public Contributor remove(Contributor requester, Long contributorId) {
        requireEditor(requester, "내보내기는 엮은이만 할 수 있어요.");
        requireCollecting("마감한 문집에서는 사람을 내보낼 수 없어요. 대신 그 글을 책에서 빼 달라고 부탁해 주세요.");
        Contributor target = contributorById(contributorId);
        if (target.isEditor()) {
            throw DomainException.rule("엮은이는 내보낼 수 없어요.");
        }
        contributors.remove(target);
        return target;
    }

    private static List<String> splitLines(String text) {
        if (text == null) {
            return List.of();
        }
        return text.replace("\r\n", "\n").lines()
                .map(String::strip)
                .filter(line -> !line.isEmpty())
                .toList();
    }

    /** 모집을 마감한다. 되돌릴 수 없다. */
    public void close(Contributor requester, long submittedEssays, LocalDateTime now) {
        requireEditor(requester, "마감은 엮은이만 할 수 있어요.");
        requireCollecting("이미 마감한 문집이에요.");
        if (submittedEssays < MIN_ESSAYS_TO_CLOSE) {
            throw DomainException.rule("제출된 독후감이 " + MIN_ESSAYS_TO_CLOSE + "편 이상이어야 마감할 수 있어요. (지금 "
                    + submittedEssays + "편)");
        }
        this.status = AnthologyStatus.CLOSED;
        this.closedAt = now;
    }

    public void requireCollecting(String message) {
        if (status != AnthologyStatus.COLLECTING) {
            throw DomainException.rule(message);
        }
    }

    private void requireEditor(Contributor requester, String message) {
        if (!requester.isEditor()) {
            throw DomainException.forbidden(message);
        }
    }

    public Optional<Contributor> findByToken(String token) {
        if (token == null) {
            return Optional.empty();
        }
        return contributors.stream().filter(contributor -> contributor.hasToken(token)).findFirst();
    }

    public Contributor contributorById(Long contributorId) {
        return contributors.stream()
                .filter(contributor -> Objects.equals(contributor.id(), contributorId))
                .findFirst()
                .orElseThrow(() -> DomainException.notFound("이 문집의 참여자가 아니에요."));
    }

    public Contributor editor() {
        return contributors.getFirst();
    }

    public boolean isFull() {
        return contributors.size() >= MAX_CONTRIBUTORS;
    }

    public boolean isClosed() {
        return status == AnthologyStatus.CLOSED;
    }

    /** 마감일까지 남은 날. 마감일이 없거나 지났으면 비어 있다. */
    public Optional<Long> daysUntilDue(LocalDate today) {
        if (dueDate == null || dueDate.isBefore(today)) {
            return Optional.empty();
        }
        return Optional.of(java.time.temporal.ChronoUnit.DAYS.between(today, dueDate));
    }

    private int nextJoinOrder() {
        return contributors.stream().mapToInt(Contributor::joinOrder).max().orElse(-1) + 1;
    }

    public void assignId(Long id) {
        if (this.id != null) {
            throw new IllegalStateException("이미 저장된 문집입니다.");
        }
        this.id = id;
    }

    public Long id() {
        return id;
    }

    public String code() {
        return code;
    }

    public String title() {
        return title;
    }

    public String bookTitle() {
        return bookTitle;
    }

    public String bookAuthor() {
        return bookAuthor;
    }

    /** 인용 아래 붙는 출처. 예: 마틴 파울러, 『리팩터링』 */
    public String citation() {
        String book = "『" + bookTitle + "』";
        return bookAuthor == null ? book : bookAuthor + ", " + book;
    }

    /** 받침에 맞춘 "~을/를 읽고". 예: 마틴 파울러, 『리팩터링』을 읽고 */
    public String readLine() {
        return citation() + Texts.josa(bookTitle, "을", "를") + " 읽고";
    }

    public String introduction() {
        return introduction;
    }

    /** 저장용 원문(줄바꿈으로 구분). */
    public String promptsText() {
        return prompts;
    }

    public List<String> prompts() {
        return splitLines(prompts);
    }

    public String appendix() {
        return appendix;
    }

    public LocalDate dueDate() {
        return dueDate;
    }

    public AnthologyStatus status() {
        return status;
    }

    public LocalDateTime createdAt() {
        return createdAt;
    }

    public LocalDateTime closedAt() {
        return closedAt;
    }

    public List<Contributor> contributors() {
        return List.copyOf(contributors);
    }
}
