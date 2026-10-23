package com.iq.anthology.room;

import java.util.List;

public interface RoomMessageRepository {

    RoomMessage save(RoomMessage message);

    /** 최근 말 limit개를 오래된 것부터 돌려준다. */
    List<RoomMessage> recent(Long anthologyId, int limit);

    void deleteByContributor(Long contributorId);

    /** 처음 방에 오면 지금까지의 말은 읽은 것으로 친다. 이미 읽은 자리가 있으면 그대로 둔다. */
    void startReading(Long anthologyId, Long contributorId);

    /** 여기까지 읽었다. 뒤로 돌아가지 않는다. */
    void markRead(Long contributorId, Long messageId);

    /** 마지막으로 읽은 말 id. 아직 없으면 0. */
    long lastRead(Long contributorId);

    /** 내가 읽은 뒤에 남이 한 말 수. */
    int unreadCount(Long anthologyId, Long contributorId);

    /** before보다 앞선(오래된) 말 limit개를 오래된 것부터. 이전 대화 더 보기. */
    List<RoomMessage> before(Long anthologyId, Long beforeId, int limit);

    /** 말 하나. 없으면 비어 있다. */
    java.util.Optional<RoomMessage> findById(Long messageId);

    /** 책갈피를 켜고 끈다. 켜졌으면 true. */
    boolean toggleBookmark(Long messageId, Long contributorId, java.time.LocalDateTime now);

    /** 말마다 책갈피를 남긴 사람들(남긴 순서). 책갈피가 없는 말은 빠진다. */
    java.util.Map<Long, List<Long>> bookmarkers(java.util.Collection<Long> messageIds);

    /** 책갈피를 하나라도 받은 말, 오래된 것부터. */
    List<RoomMessage> bookmarked(Long anthologyId);

    /** 말을 책에 싣지 않겠다고 한 사람들. */
    java.util.Set<Long> chatOptOuts(Long anthologyId);

    void setChatInBook(Long contributorId, boolean include);

        /** 오늘 마감 재촉을 보낸 것으로 남긴다. 오늘 이미 보냈으면 false(여러 서버·재시작에도 하루 한 번). */
    boolean markNudged(Long contributorId, java.time.LocalDate today);
}
