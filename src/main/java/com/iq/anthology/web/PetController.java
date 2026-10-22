package com.iq.anthology.web;

import com.iq.anthology.essay.EssayService;
import com.iq.anthology.room.Avatar;
import com.iq.anthology.room.AvatarStyle;
import com.iq.anthology.room.RoomMessage;
import com.iq.anthology.room.RoomService;
import com.iq.anthology.room.RoomService.Room;
import com.iq.anthology.support.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * 데스크톱 펫이 띄우는 화면. 이 브라우저(펫)가 가진 모든 문집 출입증을 읽어 문집마다 탭을 만든다.
 * 개인 링크를 하나 붙일 때마다 출입증이 하나씩 쌓인다(/me/{token}?to=pet).
 */
@Controller
public class PetController {

    static final int PET_HISTORY = 60;

    private static final java.util.regex.Pattern INVITE = java.util.regex.Pattern.compile("/anthologies/([A-Za-z0-9]+)");
    private static final java.util.regex.Pattern CODE = java.util.regex.Pattern.compile("[A-Za-z0-9]{4,20}");

    private final RoomService roomService;
    private final EssayService essayService;
    private final com.iq.anthology.anthology.AnthologyService anthologyService;
    private final ContributorCookies cookies;

    public PetController(RoomService roomService, EssayService essayService,
                         com.iq.anthology.anthology.AnthologyService anthologyService, ContributorCookies cookies) {
        this.roomService = roomService;
        this.essayService = essayService;
        this.anthologyService = anthologyService;
        this.cookies = cookies;
    }

    /** 펫에서 바로 문집을 연다. 출입증을 펫에 남기고 초대 링크를 돌려준다. */
    @PostMapping("/pet/anthologies")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> open(@RequestParam(required = false) String title,
                                                    @RequestParam(required = false) String bookTitle,
                                                    @RequestParam(required = false) String bookAuthor,
                                                    @RequestParam(required = false) String dueDate,
                                                    @RequestParam(required = false) String nickname,
                                                    @RequestParam(required = false) String realName,
                                                    HttpServletRequest request, HttpServletResponse response) {
        try {
            java.time.LocalDate due = com.iq.anthology.support.DueDates.parse(dueDate, anthologyService.today());
            var admission = anthologyService.open(title, bookTitle, bookAuthor, due, nickname, realName);
            cookies.write(request, response, admission.code(), admission.token());
            return ResponseEntity.ok(admitted(admission.code(), admission.token(), false));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of("message", e.getMessage()));
        }
    }

    /** 펫에서 초대 링크(또는 문집 코드)로 참여한다. 이미 참여한 문집이면 그대로 돌려준다. */
    @PostMapping("/pet/join")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> join(@RequestParam(required = false) String invite,
                                                    @RequestParam(required = false) String nickname,
                                                    @RequestParam(required = false) String realName,
                                                    HttpServletRequest request, HttpServletResponse response) {
        try {
            String code = codeOf(invite);
            String existing = cookies.read(request, code);
            if (existing != null && anthologyService.get(code).findByToken(existing).isPresent()) {
                return ResponseEntity.ok(admitted(code, existing, true));
            }
            var admission = anthologyService.join(code, nickname, realName);
            cookies.write(request, response, code, admission.token());
            return ResponseEntity.ok(admitted(code, admission.token(), false));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of("message", e.getMessage()));
        }
    }

    private Map<String, Object> admitted(String code, String token, boolean already) {
        var base = org.springframework.web.servlet.support.ServletUriComponentsBuilder.fromCurrentContextPath();
        return Map.of(
                "code", code,
                "title", anthologyService.get(code).title(),
                "inviteUrl", base.cloneBuilder().path("/anthologies/" + code).toUriString(),
                "personalUrl", base.cloneBuilder().path("/me/" + token).toUriString(),
                "already", already);
    }

    static String codeOf(String invite) {
        String text = invite == null ? "" : invite.strip();
        java.util.regex.Matcher link = INVITE.matcher(text);
        if (link.find()) {
            return link.group(1);
        }
        if (CODE.matcher(text).matches()) {
            return text;
        }
        throw DomainException.rule("초대 링크를 알아볼 수 없어요. 받은 링크를 그대로 붙여 넣어 주세요.");
    }

    @GetMapping("/pet")
    public String pet(@RequestParam(required = false) String focus, HttpServletRequest request,
                      HttpServletResponse response, Model model) {
        List<Tab> tabs = new ArrayList<>();
        for (Map.Entry<String, String> pass : cookies.all(request).entrySet()) {
            try {
                Room room = roomService.enter(pass.getKey(), pass.getValue());
                RoomView view = RoomView.of(room, essayService.shelf(room.anthology()), roomService.now());
                tabs.add(new Tab(room.anthology().code(), room.anthology().title(), view,
                        Avatar.styleOf(room.me()).format(),
                        AvatarStyle.derived(room.me().nickname(), room.me().joinOrder()).format(),
                        room.anthology().id()));
            } catch (DomainException e) {
                cookies.clear(request, response, pass.getKey()); // 링크가 바뀌었거나 내보내진 문집은 잊는다
            }
        }
        tabs.sort(Comparator.comparing(Tab::anthologyId));
        String selected = tabs.stream().map(Tab::code).filter(code -> code.equals(focus)).findFirst()
                .orElse(tabs.isEmpty() ? null : tabs.get(0).code());
        model.addAttribute("tabs", tabs);
        model.addAttribute("selected", selected);
        model.addAttribute("history", PET_HISTORY);
        model.addAttribute("bodyMax", RoomMessage.BODY_MAX);
        model.addAttribute("parts", AvatarController.partNames());
        return "anthologies/pet";
    }

    /** 예전 펫 주소. 지금은 모든 문집을 한 화면에 띄운다. */
    @GetMapping("/anthologies/{code}/pet")
    public String legacy(@PathVariable String code) {
        return "redirect:/pet?focus=" + code;
    }

    /** 펫에서 이 문집을 뺀다(출입증만 지운다. 문집에서 나가는 것은 아니다). */
    @PostMapping("/pet/leave")
    @ResponseBody
    public ResponseEntity<Void> leave(@RequestParam String code, HttpServletRequest request,
                                      HttpServletResponse response) {
        cookies.clear(request, response, code);
        return ResponseEntity.noContent().build();
    }

    /** 펫 탭 하나. meStyle은 지금 내 캐릭터, originalStyle은 고르기 전 기본 얼굴. */
    public record Tab(String code, String title, RoomView room, String meStyle, String originalStyle,
                      Long anthologyId) {

        public List<RoomView.Line> lines() {
            return room.lastLines(PET_HISTORY);
        }
    }
}
