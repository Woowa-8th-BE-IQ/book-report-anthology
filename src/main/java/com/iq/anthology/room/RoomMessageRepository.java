package com.iq.anthology.room;

import java.util.List;

public interface RoomMessageRepository {

    RoomMessage save(RoomMessage message);

    /** 최근 말 limit개를 오래된 것부터 돌려준다. */
    List<RoomMessage> recent(Long anthologyId, int limit);

    void deleteByContributor(Long contributorId);
}
