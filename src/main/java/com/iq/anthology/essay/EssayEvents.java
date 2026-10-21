package com.iq.anthology.essay;

/**
 * 문집에서 일어난 일. 모임방·펫이 받아서 알린다(essay 패키지는 누가 듣는지 모른다).
 * 트랜잭션이 커밋된 뒤에만 전달된다.
 */
public final class EssayEvents {

    private EssayEvents() {
    }

    /** 누가 독후감을 처음 제출했다. */
    public record Submitted(String code, Long contributorId, Long essayId) {
    }

    /** 누가 독후감에 답글을 달았다. */
    public record Replied(String code, Long essayId, Long writerId, Long replierId, String body) {
    }

    /** 모집이 마감됐다. */
    public record Closed(String code) {
    }
}
