package com.iq.anthology.web;

import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.AnthologyService.Reissued;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.room.RoomService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 엮은이 도구: 소개·질문·부록, 마감, 링크 재발급, 내보내기, 책 순서. 권한은 도메인이 확인한다. */
@Controller
public class EditorController extends FormSupport {

    private final AnthologyService anthologyService;
    private final EssayService essayService;
    private final RoomService roomService;
    private final ContributorCookies cookies;

    public EditorController(AnthologyService anthologyService, EssayService essayService, RoomService roomService,
                            ContributorCookies cookies) {
        this.anthologyService = anthologyService;
        this.essayService = essayService;
        this.roomService = roomService;
        this.cookies = cookies;
    }

    @PostMapping("/anthologies/{code}/introduction")
    public String introduce(@PathVariable String code, @RequestParam(required = false) String introduction,
                            HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, null, null, () -> {
            anthologyService.introduce(code, cookies.read(request, code), introduction);
            redirect.addFlashAttribute("notice", "도서 소개를 저장했어요.");
            return "redirect:/anthologies/" + code + "#editor";
        });
    }

    @PostMapping("/anthologies/{code}/prompts")
    public String ask(@PathVariable String code, @RequestParam(required = false) String prompts,
                      HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, null, null, () -> {
            anthologyService.ask(code, cookies.read(request, code), prompts);
            redirect.addFlashAttribute("notice", "글감 질문을 저장했어요. 쓰기 화면 위에 보여요.");
            return "redirect:/anthologies/" + code + "#editor";
        });
    }

    @PostMapping("/anthologies/{code}/appendix")
    public String appendix(@PathVariable String code, @RequestParam(required = false) String appendix,
                           HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code + "/book", null, null, () -> {
            anthologyService.attachAppendix(code, cookies.read(request, code), appendix);
            redirect.addFlashAttribute("notice", "부록을 저장했어요. 책 맨 뒤, 지은이 앞에 실려요.");
            return "redirect:/anthologies/" + code + "/book#appendix";
        });
    }

    @PostMapping("/anthologies/{code}/close")
    public String close(@PathVariable String code, HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, null, null, () -> {
            essayService.close(code, cookies.read(request, code));
            // 책이 되는 순간: 원고 화면이 종이가 쌓여 책이 되는 장면으로 시작한다
            redirect.addFlashAttribute("justClosed", true);
            return "redirect:/anthologies/" + code + "/book";
        });
    }

    @PostMapping("/anthologies/{code}/contributors/{contributorId}/reissue")
    public String reissue(@PathVariable String code, @PathVariable Long contributorId, HttpServletRequest request,
                          RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, null, null, () -> {
            Reissued reissued = anthologyService.reissueLink(code, cookies.read(request, code), contributorId);
            redirect.addFlashAttribute("reissuedName", reissued.nickname());
            redirect.addFlashAttribute("reissuedUrl", absolute("/me/" + reissued.token()));
            return "redirect:/anthologies/" + code + "#editor";
        });
    }

    @PostMapping("/anthologies/{code}/contributors/{contributorId}/remove")
    public String remove(@PathVariable String code, @PathVariable Long contributorId, HttpServletRequest request,
                         RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, null, null, () -> {
            String nickname = essayService.remove(code, cookies.read(request, code), contributorId);
            roomService.forget(anthologyService.get(code).id(), contributorId);
            redirect.addFlashAttribute("notice", nickname + "님을 내보냈어요. 그 사람의 글과 답글도 지웠어요.");
            return "redirect:/anthologies/" + code + "#editor";
        });
    }

    @PostMapping("/anthologies/{code}/essays/{essayId}/move")
    public String move(@PathVariable String code, @PathVariable Long essayId, @RequestParam int delta,
                       HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code + "/book", null, null, () -> {
            essayService.move(code, cookies.read(request, code), essayId, delta);
            return "redirect:/anthologies/" + code + "/book#toc-" + essayId;
        });
    }
}
