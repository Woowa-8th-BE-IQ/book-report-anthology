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
}
