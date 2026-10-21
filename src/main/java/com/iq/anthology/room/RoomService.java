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

    public static final int HISTORY = 160;
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final AnthologyService anthologyService;
    private final com.iq.anthology.anthology.AnthologyRepository anthologies;
    private final RoomMessageRepository messages;
    private final RoomHub hub;
    private final RoomNews news;
    private final Clock clock;

    public RoomService(AnthologyService anthologyService, com.iq.anthology.anthology.AnthologyRepository anthologies,
                       RoomMessageRepository messages, RoomHub hub, RoomNews news, Clock clock) {
        this.anthologyService = anthologyService;
        this.anthologies = anthologies;
        this.messages = messages;
        this.hub = hub;
        this.news = news;
        this.clock = clock;
        // 방에서 나가는 순간을 마지막 접속으로 남긴다
        hub.onLeave((anthologyId, contributorId) -> anthologyService.seenById(contributorId));
    }

    public Room enter(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        messages.startReading(anthology.id(), me.id());
        return new Room(anthology, me, messages.recent(anthology.id(), HISTORY), hub.online(anthology.id()),
                hub.positionsOf(anthology.id()), messages.unreadCount(anthology.id(), me.id()),
                messages.lastRead(me.id()));
    }

    public SseEmitter connect(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        anthologyService.seen(me);
        SseEmitter emitter = hub.join(anthology.id(), me.id());
        news.greet(anthology, me); // 마감이 가까우면 들어오자마자 알린다
        return emitter;
    }

    /** 말한다. "@닉네임"으로 부른 사람은 mentions에 담아 그 사람의 펫만 크게 반응하게 한다. */
    public Said say(String code, String token, String body) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        RoomMessage message = messages.save(RoomMessage.say(anthology.id(), me.id(), body, LocalDateTime.now(clock)));
        Said said = new Said(message, Mentions.find(message.body(), anthology.contributors(), me.id()));
        messages.markRead(me.id(), message.id()); // 내 말까지는 읽은 것이다
        hub.broadcast(anthology.id(), "message", said.event());
        return said;
    }

    /** 여기까지 읽었다(펫·방에서 대화를 보고 있을 때). */
    public void read(String code, String token, Long messageId) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        if (messageId != null && messageId > 0) {
            messages.markRead(me.id(), messageId);
        }
    }

    public record Said(RoomMessage message, java.util.Set<Long> mentions) {

        public Map<String, Object> event() {
            return RoomService.event(message, mentions);
        }
    }

    /**
     * 내 캐릭터를 바꾼다. style이 비어 있으면 기본 얼굴로 돌아간다.
     * 모임방과 펫에 바로 보이도록 새 그림을 방에 알린다.
     */
    public AvatarStyle changeAvatar(String code, String token, String style) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        boolean reset = style == null || style.isBlank();
        AvatarStyle chosen = reset ? AvatarStyle.derived(me.nickname(), me.joinOrder()) : AvatarStyle.parse(style);
        me.dressUp(reset ? null : chosen.format());
        anthologies.updateAvatar(me);
        hub.broadcast(anthology.id(), "avatar", Map.of("contributorId", me.id(), "svg", Avatar.svg(chosen)));
        return chosen;
    }

    /** 꾸미기 화면에 쓸 지금 내 모양. */
    public Dressing dressing(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        return new Dressing(anthology, me, Avatar.styleOf(me), AvatarStyle.derived(me.nickname(), me.joinOrder()));
    }

    public record Dressing(Anthology anthology, Contributor me, AvatarStyle current, AvatarStyle original) {
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

    public static Map<String, Object> event(RoomMessage message, java.util.Set<Long> mentions) {
        return Map.of(
                "id", message.id(),
                "contributorId", message.contributorId(),
                "body", message.body(),
                "at", message.createdAt().format(TIME),
                "mentions", List.copyOf(mentions));
    }

    /** unread는 내가 읽은 뒤 남이 한 말 수, lastRead는 마지막으로 읽은 말 id. */
    public record Room(Anthology anthology, Contributor me, List<RoomMessage> messages, java.util.Set<Long> online,
                       Map<Long, RoomHub.Position> positions, int unread, long lastRead) {
    }
}
