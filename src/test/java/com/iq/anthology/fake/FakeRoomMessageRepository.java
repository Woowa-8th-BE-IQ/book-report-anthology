package com.iq.anthology.fake;

import com.iq.anthology.room.RoomMessage;
import com.iq.anthology.room.RoomMessageRepository;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 마감 재촉 기록만 흉내 낸다. 말 저장은 쓰지 않는다. */
public class FakeRoomMessageRepository implements RoomMessageRepository {

    private final Map<Long, LocalDate> nudgedOn = new HashMap<>();

    @Override
    public boolean markNudged(Long contributorId, LocalDate today) {
        LocalDate last = nudgedOn.get(contributorId);
        if (last != null && !last.isBefore(today)) {
            return false;
        }
        nudgedOn.put(contributorId, today);
        return true;
    }

    @Override
    public RoomMessage save(RoomMessage message) {
        throw new UnsupportedOperationException();
    }

    @Override
    public List<RoomMessage> recent(Long anthologyId, int limit) {
        return List.of();
    }

    @Override
    public void deleteByContributor(Long contributorId) {
    }

    @Override
    public void startReading(Long anthologyId, Long contributorId) {
    }

    @Override
    public void markRead(Long contributorId, Long messageId) {
    }

    @Override
    public long lastRead(Long contributorId) {
        return 0;
    }

    @Override
    public int unreadCount(Long anthologyId, Long contributorId) {
        return 0;
    }
}
