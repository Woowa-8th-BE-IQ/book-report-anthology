package com.iq.anthology.room;

import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 모임방의 실시간 연결(Server-Sent Events). 누가 들어와 있는지 기억하고, 말·쓰는 중·들고 남을 방 전체에 알린다.
 *
 * <p>연결은 서버 한 대의 메모리에만 있다. 서버를 여러 대로 늘리면 Redis pub/sub 같은 중계가 필요하다.
 * 연결이 끊겨도 브라우저(EventSource)가 알아서 다시 붙고, 말은 DB에 남아 있으니 잃지 않는다.
 */
@Component
public class RoomHub {

    static final Duration CONNECTION_TTL = Duration.ofMinutes(15);

    private final Map<Long, List<Connection>> rooms = new ConcurrentHashMap<>();
    /** 방 안에서 걸어간 자리. 방을 완전히 나가면 지워지고 다시 들어오면 제자리에서 시작한다. */
    private final Map<Long, Map<Long, Position>> positions = new ConcurrentHashMap<>();

    /** 방에 들어온다. 들어온 사람에게 지금 있는 사람들을, 방 전체에 새 얼굴을 알린다. */
    public SseEmitter join(Long anthologyId, Long contributorId) {
        SseEmitter emitter = new SseEmitter(CONNECTION_TTL.toMillis());
        Connection connection = new Connection(contributorId, emitter);
        List<Connection> room = rooms.computeIfAbsent(anthologyId, id -> new CopyOnWriteArrayList<>());
        room.add(connection);
        Runnable leave = () -> leave(anthologyId, connection);
        emitter.onCompletion(leave);
        emitter.onTimeout(leave);
        emitter.onError(error -> leave.run());

        send(anthologyId, connection, "hello", Map.of("online", online(anthologyId),
                "positions", positionsOf(anthologyId)));
        broadcast(anthologyId, "presence", Map.of("online", online(anthologyId)));
        return emitter;
    }

    public void broadcast(Long anthologyId, String event, Object data) {
        for (Connection connection : rooms.getOrDefault(anthologyId, List.of())) {
            send(anthologyId, connection, event, data);
        }
    }

    /** 지금 방에 있는 참여자 id. 한 사람이 탭을 여러 개 열어도 한 번만 센다. */
    public Set<Long> online(Long anthologyId) {
        Set<Long> ids = new LinkedHashSet<>();
        rooms.getOrDefault(anthologyId, List.of()).forEach(connection -> ids.add(connection.contributorId()));
        return ids;
    }

    /** 내 아바타를 방 안의 (x, y)로 옮긴다. 둘 다 0~1(방 너비·높이에 대한 비율)이다. */
    public void move(Long anthologyId, Long contributorId, Position position) {
        if (!online(anthologyId).contains(contributorId)) {
            return; // 방에 없는 사람은 움직일 수 없다
        }
        positions.computeIfAbsent(anthologyId, id -> new ConcurrentHashMap<>()).put(contributorId, position);
        broadcast(anthologyId, "move", Map.of("contributorId", contributorId, "x", position.x(), "y", position.y()));
    }

    public Map<Long, Position> positionsOf(Long anthologyId) {
        return Map.copyOf(positions.getOrDefault(anthologyId, Map.of()));
    }

    /** 내보낸 사람의 연결을 끊는다. */
    public void kick(Long anthologyId, Long contributorId) {
        rooms.getOrDefault(anthologyId, List.of()).stream()
                .filter(connection -> connection.contributorId().equals(contributorId))
                .forEach(connection -> connection.emitter().complete());
    }

    /** 프록시가 조용한 연결을 끊지 않도록 20초마다 빈 신호를 보낸다. 끊긴 연결도 이때 걸러진다. */
    @Scheduled(fixedDelay = 20_000)
    public void heartbeat() {
        rooms.forEach((anthologyId, room) -> room.forEach(connection -> {
            try {
                synchronized (connection) {
                    connection.emitter().send(SseEmitter.event().comment("keep-alive"));
                }
            } catch (IOException | IllegalStateException e) {
                leave(anthologyId, connection);
            }
        }));
    }

    private void send(Long anthologyId, Connection connection, String event, Object data) {
        try {
            synchronized (connection) {
                connection.emitter().send(SseEmitter.event().name(event).data(data, MediaType.APPLICATION_JSON));
            }
        } catch (IOException | IllegalStateException e) {
            leave(anthologyId, connection);
        }
    }

    private void leave(Long anthologyId, Connection connection) {
        List<Connection> room = rooms.get(anthologyId);
        if (room == null || !room.remove(connection)) {
            return;
        }
        if (room.isEmpty()) {
            rooms.remove(anthologyId, room);
            positions.remove(anthologyId);
        } else if (!online(anthologyId).contains(connection.contributorId())) {
            positions.getOrDefault(anthologyId, Map.of()).remove(connection.contributorId());
        }
        broadcast(anthologyId, "presence", Map.of("online", online(anthologyId)));
    }

    private record Connection(Long contributorId, SseEmitter emitter) {
    }

    /** 방 안의 자리. 0~1 밖의 값은 가장자리로 붙인다. */
    public record Position(double x, double y) {

        public Position {
            if (Double.isNaN(x) || Double.isNaN(y)) {
                throw com.iq.anthology.support.DomainException.rule("자리가 숫자가 아니에요.");
            }
            x = Math.round(Math.clamp(x, 0.0, 1.0) * 1000) / 1000.0;
            y = Math.round(Math.clamp(y, 0.0, 1.0) * 1000) / 1000.0;
        }
    }
}
