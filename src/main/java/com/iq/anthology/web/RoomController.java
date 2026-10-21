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
        model.addAttribute("personalUrl", org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentContextPath().path("/me/" + room.me().token()).toUriString());
        return "anthologies/room";
    }

    /** 데스크톱 펫이 띄우는 작은 화면. 모임방과 같은 연결·말하기를 쓴다. */
    @GetMapping("/anthologies/{code}/pet")
    public String pet(@PathVariable String code, HttpServletRequest request, Model model) {
        try {
            Room room = roomService.enter(code, cookies.read(request, code));
            model.addAttribute("room", RoomView.of(room, essayService.shelf(room.anthology()), roomService.now()));
            model.addAttribute("bodyMax", RoomMessage.BODY_MAX);
        } catch (DomainException e) {
            if (e.type() != ErrorType.FORBIDDEN && e.type() != ErrorType.NOT_FOUND) {
                throw e;
            }
            model.addAttribute("problem", "연결이 끊겼어요. 개인 링크를 다시 붙여 넣어 주세요.");
        }
        return "anthologies/pet";
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
            RoomMessage message = roomService.say(code, cookies.read(request, code), body);
            return ResponseEntity.ok(RoomService.event(message));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of("message", e.getMessage()));
        }
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
