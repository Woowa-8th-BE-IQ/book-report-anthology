package com.iq.anthology.room;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.Contributor;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** 모임방: 참여자만 들어오고, 말은 DB에 남기고 방에 있는 사람들에게 바로 보낸다. */
@Service
public class RoomService {

    public static final int HISTORY = 80;
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final AnthologyService anthologyService;
    private final RoomMessageRepository messages;
    private final RoomHub hub;
    private final Clock clock;

    public RoomService(AnthologyService anthologyService, RoomMessageRepository messages, RoomHub hub, Clock clock) {
        this.anthologyService = anthologyService;
        this.messages = messages;
        this.hub = hub;
        this.clock = clock;
        // 방에서 나가는 순간을 마지막 접속으로 남긴다
        hub.onLeave((anthologyId, contributorId) -> anthologyService.seenById(contributorId));
    }

    public Room enter(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        return new Room(anthology, me, messages.recent(anthology.id(), HISTORY), hub.online(anthology.id()),
                hub.positionsOf(anthology.id()));
    }

    public SseEmitter connect(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        anthologyService.seen(me);
        return hub.join(anthology.id(), me.id());
    }

    public RoomMessage say(String code, String token, String body) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        RoomMessage message = messages.save(RoomMessage.say(anthology.id(), me.id(), body, LocalDateTime.now(clock)));
        hub.broadcast(anthology.id(), "message", event(message));
        return message;
    }

    /** "○○님이 쓰는 중". 저장하지 않고 방에만 알린다. */
    public void typing(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        hub.broadcast(anthology.id(), "typing", Map.of("contributorId", me.id()));
    }

    /** 내 아바타를 걸어가게 한다. 저장하지 않고 방에만 알린다. */
    public void move(String code, String token, double x, double y) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        hub.move(anthology.id(), me.id(), new RoomHub.Position(x, y));
    }

    public java.util.Set<Long> online(Anthology anthology) {
        return hub.online(anthology.id());
    }

    public LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    /** 문집 화면에 "지금 N명 있어요"를 띄울 때. */
    public int onlineCount(Anthology anthology) {
        return hub.online(anthology.id()).size();
    }

    /** 엮은이가 참여자를 내보내면 그 사람의 말과 연결도 정리한다. */
    public void forget(Long anthologyId, Long contributorId) {
        messages.deleteByContributor(contributorId);
        hub.kick(anthologyId, contributorId);
    }

    public static Map<String, Object> event(RoomMessage message) {
        return Map.of(
                "id", message.id(),
                "contributorId", message.contributorId(),
                "body", message.body(),
                "at", message.createdAt().format(TIME));
    }

    public record Room(Anthology anthology, Contributor me, List<RoomMessage> messages, java.util.Set<Long> online,
                       Map<Long, RoomHub.Position> positions) {
    }
}
