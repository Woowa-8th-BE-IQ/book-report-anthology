package com.iq.anthology.web;

import com.iq.anthology.room.Avatar;
import com.iq.anthology.room.AvatarStyle;
import com.iq.anthology.room.RoomService;
import com.iq.anthology.room.RoomService.Dressing;
import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.ToIntFunction;
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

/** 캐릭터 꾸미기: 조각을 골라 내 아바타를 바꾼다. */
@Controller
public class AvatarController extends FormSupport {

    private final RoomService roomService;
    private final ContributorCookies cookies;

    public AvatarController(RoomService roomService, ContributorCookies cookies) {
        this.roomService = roomService;
        this.cookies = cookies;
    }

    /** 모양 글자(c3b1e2m0x4k1)로 그린 그림. 같은 글자는 언제나 같은 그림이라 오래 캐시한다. */
    @GetMapping("/avatars/{style}.svg")
    @ResponseBody
    public ResponseEntity<String> preview(@PathVariable String style) {
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml"))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(Avatar.svg(AvatarStyle.parse(style)));
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
        AvatarStyle current = dressing.current();
        model.addAttribute("dressing", dressing);
        model.addAttribute("back", "room".equals(back) ? "room" : "home");
        model.addAttribute("parts", List.of(
                part("color", "색", AvatarStyle.COLORS, current, AvatarStyle::color, AvatarStyle::withColor,
                        "살구", "쑥", "하늘", "라벤더", "겨자", "산호", "민트", "모래", "벚꽃", "먹구름"),
                part("body", "몸", AvatarStyle.BODIES, current, AvatarStyle::body, AvatarStyle::withBody,
                        "동그라미", "책", "네모", "구름", "고양이"),
                part("eyes", "눈", AvatarStyle.EYES, current, AvatarStyle::eyes, AvatarStyle::withEyes,
                        "점", "웃는 눈", "안경", "윙크"),
                part("mouth", "입", AvatarStyle.MOUTHS, current, AvatarStyle::mouth, AvatarStyle::withMouth,
                        "미소", "오", "일자", "활짝"),
                part("extra", "소품", AvatarStyle.EXTRAS, current, AvatarStyle::extra, AvatarStyle::withExtra,
                        "없음", "책갈피", "베레모", "새싹", "별", "꽃"),
                part("cheeks", "볼", AvatarStyle.CHEEKS, current, AvatarStyle::cheeks, AvatarStyle::withCheeks,
                        "없음", "볼터치")));
        return "anthologies/avatar";
    }

    @PostMapping("/anthologies/{code}/avatar")
    public String save(@PathVariable String code, @RequestParam(required = false) String style,
                       @RequestParam(required = false) Integer color, @RequestParam(required = false) Integer body,
                       @RequestParam(required = false) Integer eyes, @RequestParam(required = false) Integer mouth,
                       @RequestParam(required = false) Integer extra, @RequestParam(required = false) Integer cheeks,
                       @RequestParam(defaultValue = "home") String back, HttpServletRequest request,
                       RedirectAttributes redirect) {
        // JS가 없으면 조각별 라디오 값으로 모양 글자를 만든다
        if (style == null && color != null && body != null && eyes != null && mouth != null && extra != null
                && cheeks != null) {
            style = "c" + color + "b" + body + "e" + eyes + "m" + mouth + "x" + extra + "k" + cheeks;
        }
        String chosen = style;
        String editor = "/anthologies/" + code + "/avatar?back=" + ("room".equals(back) ? "room" : "home");
        return attempt(redirect, editor, null, null, () -> {
            roomService.changeAvatar(code, cookies.read(request, code), chosen);
            redirect.addFlashAttribute("notice", "캐릭터를 바꿨어요. 모임방과 펫에도 바로 보여요.");
            return "redirect:/anthologies/" + code + ("room".equals(back) ? "/room" : "#seats");
        });
    }

    /** 펫 안 꾸미기 화면이 쓰는 조각 이름표. */
    static List<Part> partNames() {
        AvatarStyle any = new AvatarStyle(0, 0, 0, 0, 0, 0);
        return List.of(
                part("color", "색", AvatarStyle.COLORS, any, AvatarStyle::color, AvatarStyle::withColor,
                        "살구", "쑥", "하늘", "라벤더", "겨자", "산호", "민트", "모래", "벚꽃", "먹구름"),
                part("body", "몸", AvatarStyle.BODIES, any, AvatarStyle::body, AvatarStyle::withBody,
                        "동그라미", "책", "네모", "구름", "고양이"),
                part("eyes", "눈", AvatarStyle.EYES, any, AvatarStyle::eyes, AvatarStyle::withEyes,
                        "점", "웃는 눈", "안경", "윙크"),
                part("mouth", "입", AvatarStyle.MOUTHS, any, AvatarStyle::mouth, AvatarStyle::withMouth,
                        "미소", "오", "일자", "활짝"),
                part("extra", "소품", AvatarStyle.EXTRAS, any, AvatarStyle::extra, AvatarStyle::withExtra,
                        "없음", "책갈피", "베레모", "새싹", "별", "꽃"),
                part("cheeks", "볼", AvatarStyle.CHEEKS, any, AvatarStyle::cheeks, AvatarStyle::withCheeks,
                        "없음", "볼터치"));
    }

    /** 펫에서 바꿀 때(X-Room 헤더): JSON으로 답한다. */
    @PostMapping(path = "/anthologies/{code}/avatar", headers = "X-Room")
    @ResponseBody
    public ResponseEntity<java.util.Map<String, Object>> saveFromScript(@PathVariable String code,
                                                                        @RequestParam(required = false) String style,
                                                                        HttpServletRequest request) {
        try {
            AvatarStyle chosen = roomService.changeAvatar(code, cookies.read(request, code), style);
            return ResponseEntity.ok(java.util.Map.of("style", chosen.format(), "svg", Avatar.svg(chosen)));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(java.util.Map.of("message", e.getMessage()));
        }
    }

    private static Part part(String key, String label, int count, AvatarStyle current, ToIntFunction<AvatarStyle> get,
                             BiFunction<AvatarStyle, Integer, AvatarStyle> with, String... names) {
        List<Option> options = new ArrayList<>();
        for (int value = 0; value < count; value++) {
            options.add(new Option(value, names[value], with.apply(current, value).format(),
                    get.applyAsInt(current) == value));
        }
        return new Part(key, label, options);
    }

    public record Part(String key, String label, List<Option> options) {
    }

    /** style: 지금 모양에서 이 조각만 바꾼 모양(미리보기 그림 주소에 쓴다). */
    public record Option(int value, String name, String style, boolean selected) {
    }
}
