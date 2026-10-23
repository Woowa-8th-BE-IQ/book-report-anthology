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
        List<RoomMessage> recent = messages.recent(anthology.id(), HISTORY);
        return new Room(anthology, me, recent, hub.online(anthology.id()),
                hub.positionsOf(anthology.id()), messages.unreadCount(anthology.id(), me.id()),
                messages.lastRead(me.id()), messages.bookmarkers(recent.stream().map(RoomMessage::id).toList()));
    }

    public static final int PAGE = 80;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("M월 d일");

    /** 이전 대화 더 보기: before보다 오래된 말 PAGE개. 말마다 부른 사람·책갈피 수·내 책갈피를 붙인다. */
    public Older older(String code, String token, Long beforeId) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        List<RoomMessage> page = messages.before(anthology.id(), beforeId == null ? Long.MAX_VALUE : beforeId, PAGE + 1);
        boolean more = page.size() > PAGE;
        List<RoomMessage> shown = more ? page.subList(1, page.size()) : page;
        Map<Long, List<Long>> marks = messages.bookmarkers(shown.stream().map(RoomMessage::id).toList());
        java.util.Set<Long> members = anthology.contributors().stream().map(Contributor::id)
                .collect(java.util.stream.Collectors.toSet());
        List<Map<String, Object>> events = shown.stream()
                .filter(message -> members.contains(message.contributorId()))
                .map(message -> {
                    Map<String, Object> event = new java.util.LinkedHashMap<>(event(message,
                            Mentions.find(message.body(), anthology.contributors(), message.contributorId())));
                    List<Long> markers = marks.getOrDefault(message.id(), List.of());
                    event.put("marks", markers.size());
                    event.put("marked", markers.contains(me.id()));
                    event.put("day", message.createdAt().format(DAY));
                    return (Map<String, Object>) event;
                })
                .toList();
        return new Older(events, more);
    }

    public record Older(List<Map<String, Object>> messages, boolean more) {
    }

    /** 마음에 든 말에 책갈피를 남기거나 거둔다. 방에 책갈피 수를 알린다. */
    public Map<String, Object> bookmark(String code, String token, Long messageId) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        RoomMessage message = messages.findById(messageId)
                .filter(found -> found.anthologyId().equals(anthology.id()))
                .orElseThrow(() -> com.iq.anthology.support.DomainException.notFound("그 말을 찾을 수 없어요."));
        boolean marked = messages.toggleBookmark(message.id(), me.id(), LocalDateTime.now(clock));
        int count = messages.bookmarkers(List.of(message.id())).getOrDefault(message.id(), List.of()).size();
        hub.broadcast(anthology.id(), "bookmark", Map.of("messageId", message.id(), "marks", count));
        return Map.of("messageId", message.id(), "marks", count, "marked", marked);
    }

    /** 책갈피 모음: 책갈피를 받은 말과 남긴 사람들, 내 "책에 싣기" 설정. */
    public Collection collection(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        List<RoomMessage> marked = messages.bookmarked(anthology.id());
        Map<Long, List<Long>> marks = messages.bookmarkers(marked.stream().map(RoomMessage::id).toList());
        return new Collection(anthology, me, marked, marks, !messages.chatOptOuts(anthology.id()).contains(me.id()));
    }

    public record Collection(Anthology anthology, Contributor me, List<RoomMessage> messages,
                             Map<Long, List<Long>> marks, boolean chatInBook) {
    }

    /** 내 말을 책에 실을지. */
    public void chatInBook(String code, String token, boolean include) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        messages.setChatInBook(me.id(), include);
    }

    /** marks는 말마다 책갈피를 남긴 사람들. */
    public record Room(Anthology anthology, Contributor me, List<RoomMessage> messages, java.util.Set<Long> online,
                       Map<Long, RoomHub.Position> positions, int unread, long lastRead, Map<Long, List<Long>> marks) {
    }
}
