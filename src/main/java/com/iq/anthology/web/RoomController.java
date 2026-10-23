package com.iq.anthology.web;

import com.iq.anthology.essay.EssayService;
import com.iq.anthology.room.RoomMessage;
import com.iq.anthology.room.RoomService;
import com.iq.anthology.room.RoomService.Room;
import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** 모임방: 화면, 실시간 연결(SSE), 말하기, 쓰는 중. */
@Controller
public class RoomController {

    private final RoomService roomService;
    private final EssayService essayService;
    private final ContributorCookies cookies;

    public RoomController(RoomService roomService, EssayService essayService, ContributorCookies cookies) {
        this.roomService = roomService;
        this.essayService = essayService;
        this.cookies = cookies;
    }

    @GetMapping("/anthologies/{code}/room")
    public String room(@PathVariable String code, HttpServletRequest request, Model model) {
        String token = cookies.read(request, code);
        Room room;
        try {
            room = roomService.enter(code, token);
        } catch (DomainException e) {
            if (e.type() == ErrorType.FORBIDDEN) {
                return "redirect:/anthologies/" + code; // 참여 폼으로
            }
            throw e;
        }
        model.addAttribute("room", RoomView.of(room, essayService.shelf(room.anthology()), roomService.now()));
        model.addAttribute("bodyMax", RoomMessage.BODY_MAX);
        model.addAttribute("build", com.iq.anthology.room.RoomHub.BUILD);
        model.addAttribute("personalUrl", org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentContextPath().path("/me/" + room.me().token()).toUriString());
        return "anthologies/room";
    }

    @GetMapping(path = "/anthologies/{code}/room/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String code, HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        return roomService.connect(code, cookies.read(request, code));
    }

    /** JS가 없을 때: 폼 제출 뒤 방으로 돌아온다. */
    @PostMapping("/anthologies/{code}/room/messages")
    public String say(@PathVariable String code, @RequestParam(required = false) String body,
                      HttpServletRequest request) {
        roomService.say(code, cookies.read(request, code), body);
        return "redirect:/anthologies/" + code + "/room#talk-end";
    }

    /** JS에서 보낼 때(X-Room 헤더): JSON으로 답한다. 내 말도 실시간 이벤트로 다시 돌아온다. */
    @PostMapping(path = "/anthologies/{code}/room/messages", headers = "X-Room")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> sayFromScript(@PathVariable String code,
                                                             @RequestParam(required = false) String body,
                                                             HttpServletRequest request) {
        try {
            return ResponseEntity.ok(roomService.say(code, cookies.read(request, code), body).event());
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of("message", e.getMessage()));
        }
    }

    /** 이전 대화 더 보기: before보다 오래된 말을 JSON으로. */
    @GetMapping(path = "/anthologies/{code}/room/messages", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Object> older(@PathVariable String code, @RequestParam(required = false) Long before,
                                        HttpServletRequest request) {
        try {
            return ResponseEntity.ok(roomService.older(code, cookies.read(request, code), before));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of("message", e.getMessage()));
        }
    }

    /** 마음에 든 말에 책갈피를 남기거나 거둔다. */
    @PostMapping("/anthologies/{code}/room/messages/{messageId}/bookmark")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> bookmark(@PathVariable String code, @PathVariable Long messageId,
                                                        HttpServletRequest request) {
        try {
            return ResponseEntity.ok(roomService.bookmark(code, cookies.read(request, code), messageId));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of("message", e.getMessage()));
        }
    }

    /** 책갈피 모음: 서로 책갈피를 남긴 말을 대화처럼 모아 본다. */
    @GetMapping("/anthologies/{code}/room/bookmarks")
    public String bookmarks(@PathVariable String code, @RequestParam(defaultValue = "all") String show,
                            HttpServletRequest request, Model model) {
        String token = cookies.read(request, code);
        RoomService.Collection collection;
        try {
            collection = roomService.collection(code, token);
        } catch (DomainException e) {
            if (e.type() == ErrorType.FORBIDDEN) {
                return "redirect:/anthologies/" + code;
            }
            throw e;
        }
        model.addAttribute("view", BookmarksView.of(collection, "mine".equals(show)));
        model.addAttribute("show", "mine".equals(show) ? "mine" : "all");
        return "anthologies/bookmarks";
    }

    /** 내 말을 책에 실을지 정한다. */
    @PostMapping("/anthologies/{code}/room/chat-in-book")
    public String chatInBook(@PathVariable String code, @RequestParam(defaultValue = "false") boolean include,
                             HttpServletRequest request) {
        roomService.chatInBook(code, cookies.read(request, code), include);
        return "redirect:/anthologies/" + code + "/room/bookmarks";
    }

        /** 여기까지 읽었다. 펫의 안 읽은 수가 다시 켜도 이어지게 한다. */
    @PostMapping("/anthologies/{code}/room/read")
    @ResponseBody
    public ResponseEntity<Void> read(@PathVariable String code, @RequestParam(required = false) Long upTo,
                                     HttpServletRequest request) {
        roomService.read(code, cookies.read(request, code), upTo);
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    @PostMapping("/anthologies/{code}/room/position")
    @ResponseBody
    public ResponseEntity<Void> move(@PathVariable String code, @RequestParam double x, @RequestParam double y,
                                     HttpServletRequest request) {
        roomService.move(code, cookies.read(request, code), x, y);
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    @PostMapping("/anthologies/{code}/room/typing")
    @ResponseBody
    public ResponseEntity<Void> typing(@PathVariable String code, HttpServletRequest request) {
        roomService.typing(code, cookies.read(request, code));
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }
}
