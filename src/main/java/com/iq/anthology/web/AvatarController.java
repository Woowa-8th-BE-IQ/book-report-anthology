package com.iq.anthology.web;

import com.iq.anthology.room.Avatar;
import com.iq.anthology.room.Critter;
import com.iq.anthology.room.RoomService;
import com.iq.anthology.room.RoomService.Dressing;
import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import com.iq.anthology.support.Texts;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 캐릭터: 꼬깃단 여덟 친구 소개, 그림, 내 캐릭터 고르기. */
@Controller
public class AvatarController extends FormSupport {

    private final RoomService roomService;
    private final ContributorCookies cookies;

    public AvatarController(RoomService roomService, ContributorCookies cookies) {
        this.roomService = roomService;
        this.cookies = cookies;
    }

    /** 덕후감 서재의 꼬깃단. 누구나 볼 수 있다. */
    @GetMapping("/characters")
    public String characters(Model model) {
        model.addAttribute("critters", Critter.values());
        model.addAttribute("ogDescription", "덕후감 서재의 꼬깃단. 책을 좋아하는 하찮은 동물들, 다만 조금씩 서툴러요.");
        return "characters";
    }

    /**
     * 캐릭터 그림 한 장. 같은 주소는 언제나 같은 그림이라 오래 캐시한다.
     * 그림을 고치면 주소의 판(v4)을 올린다.
     */
    @GetMapping("/avatars/v4/{slug}.svg")
    @ResponseBody
    public ResponseEntity<String> preview(@PathVariable String slug) {
        return svg(Avatar.svg(Critter.of(slug)));
    }

    /** 예전 꾸미기 주소(c3b1e2m0x4k1). 조각 그림은 없어졌으니 그 글자로 정한 꼬깃단 하나를 보여 준다. */
    @GetMapping({"/avatars/v3/{style}.svg", "/avatars/v2/{style}.svg", "/avatars/{style}.svg"})
    @ResponseBody
    public ResponseEntity<String> legacy(@PathVariable String style) {
        return svg(Avatar.svg(Critter.find(style).orElseGet(() -> Critter.derived(style.hashCode()))));
    }

    private static ResponseEntity<String> svg(String body) {
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml"))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(body);
    }

    @GetMapping("/anthologies/{code}/avatar")
    public String editor(@PathVariable String code, @RequestParam(defaultValue = "home") String back,
                         HttpServletRequest request, Model model) {
        Dressing dressing;
        try {
            dressing = roomService.dressing(code, cookies.read(request, code));
        } catch (DomainException e) {
            if (e.type() == ErrorType.FORBIDDEN) {
                return "redirect:/anthologies/" + code;
            }
            throw e;
        }
        model.addAttribute("dressing", dressing);
        model.addAttribute("back", "room".equals(back) ? "room" : "home");
        model.addAttribute("critters", List.of(Critter.values()));
        return "anthologies/avatar";
    }

    @PostMapping("/anthologies/{code}/avatar")
    public String save(@PathVariable String code, @RequestParam(required = false) String critter,
                       @RequestParam(defaultValue = "home") String back, HttpServletRequest request,
                       RedirectAttributes redirect) {
        String editor = "/anthologies/" + code + "/avatar?back=" + ("room".equals(back) ? "room" : "home");
        return attempt(redirect, editor, null, null, () -> {
            Critter chosen = roomService.changeAvatar(code, cookies.read(request, code), critter);
            redirect.addFlashAttribute("notice", "이제 " + chosen.title()
                    + Texts.josa(chosen.title(), "이에요", "예요") + ". 모임방과 펫에도 바로 보여요.");
            return "redirect:/anthologies/" + code + ("room".equals(back) ? "/room" : "#seats");
        });
    }

    /** 펫에서 바꿀 때(X-Room 헤더): JSON으로 답한다. */
    @PostMapping(path = "/anthologies/{code}/avatar", headers = "X-Room")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> saveFromScript(@PathVariable String code,
                                                              @RequestParam(required = false) String critter,
                                                              HttpServletRequest request) {
        try {
            Critter chosen = roomService.changeAvatar(code, cookies.read(request, code), critter);
            return ResponseEntity.ok(Map.of("critter", chosen.slug(), "svg", Avatar.svg(chosen)));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of("message", e.getMessage()));
        }
    }
}
