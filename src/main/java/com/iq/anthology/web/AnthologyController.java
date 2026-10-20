package com.iq.anthology.web;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.AnthologyService.Admission;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.book.BookService;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Supplier;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@Controller
public class AnthologyController {

    private static final MediaType EPUB = MediaType.parseMediaType("application/epub+zip");

    private final AnthologyService anthologyService;
    private final EssayService essayService;
    private final BookService bookService;
    private final ContributorCookies cookies;

    public AnthologyController(AnthologyService anthologyService, EssayService essayService, BookService bookService,
                               ContributorCookies cookies) {
        this.anthologyService = anthologyService;
        this.essayService = essayService;
        this.bookService = bookService;
        this.cookies = cookies;
    }

    @GetMapping("/")
    public String landing() {
        return "index";
    }

    // ───────── 문집 만들기·참여 ─────────

    @GetMapping("/anthologies/new")
    public String newAnthology(Model model) {
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new Forms.OpenAnthology());
        }
        model.addAttribute("today", anthologyService.today());
        return "anthologies/new";
    }

    @PostMapping("/anthologies")
    public String open(@ModelAttribute("form") Forms.OpenAnthology form, BindingResult binding,
                       HttpServletRequest request, HttpServletResponse response, RedirectAttributes redirect) {
        if (binding.hasErrors()) {
            return back(redirect, "/anthologies/new", "form", form, "마감일 형식이 올바르지 않아요.");
        }
        return attempt(redirect, "/anthologies/new", "form", form, () -> {
            Admission admission = anthologyService.open(form.getTitle(), form.getBookTitle(), form.getBookAuthor(),
                    form.getDueDate(), form.getNickname(), form.getRealName());
            cookies.write(request, response, admission.code(), admission.token());
            redirect.addFlashAttribute("notice", "문집을 열었어요. 초대 링크를 함께 쓸 사람들에게 보내 주세요.");
            return "redirect:/anthologies/" + admission.code();
        });
    }

    @PostMapping("/anthologies/{code}/contributors")
    public String join(@PathVariable String code, @ModelAttribute("joinForm") Forms.Join form,
                       HttpServletRequest request, HttpServletResponse response, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, "joinForm", form, () -> {
            Admission admission = anthologyService.join(code, form.getNickname(), form.getRealName());
            cookies.write(request, response, code, admission.token());
            redirect.addFlashAttribute("notice", "들어왔어요. 독후감을 쓰고 제출하면 다른 사람의 글이 열려요.");
            return "redirect:/anthologies/" + code;
        });
    }

    // ───────── 문집 화면 ─────────

    @GetMapping("/anthologies/{code}")
    public String show(@PathVariable String code, HttpServletRequest request, Model model) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = anthology.findByToken(cookies.read(request, code)).orElse(null);
        Shelf shelf = essayService.shelf(anthology);
        model.addAttribute("view", ShelfView.of(shelf, me, anthologyService.today()));
        model.addAttribute("inviteUrl", absolute("/anthologies/" + code));
        model.addAttribute("aboutUrl", absolute("/anthologies/" + code + "/about"));
        if (me != null) {
            model.addAttribute("personalUrl", absolute("/me/" + me.token()));
        }
        if (!model.containsAttribute("joinForm")) {
            model.addAttribute("joinForm", new Forms.Join());
        }
        model.addAttribute("introductionMax", Anthology.INTRODUCTION_MAX);
        return "anthologies/show";
    }

    @PostMapping("/anthologies/{code}/introduction")
    public String introduce(@PathVariable String code, @RequestParam(required = false) String introduction,
                            HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, null, null, () -> {
            anthologyService.introduce(code, cookies.read(request, code), introduction);
            redirect.addFlashAttribute("notice", "도서 소개를 저장했어요.");
            return "redirect:/anthologies/" + code + "#introduction";
        });
    }

    @PostMapping("/anthologies/{code}/close")
    public String close(@PathVariable String code, HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code, null, null, () -> {
            essayService.close(code, cookies.read(request, code));
            redirect.addFlashAttribute("notice", "마감했어요. 이제 한 권으로 엮을 수 있어요.");
            return "redirect:/anthologies/" + code + "/book";
        });
    }

    // ───────── 독후감 쓰기·읽기 ─────────

    @GetMapping("/anthologies/{code}/write")
    public String write(@PathVariable String code, HttpServletRequest request, Model model) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, cookies.read(request, code));
        if (anthology.isClosed()) {
            return "redirect:/anthologies/" + code;
        }
        Essay mine = essayService.shelf(anthology).essayOf(me).orElse(null);
        if (!model.containsAttribute("essayForm")) {
            Forms.WriteEssay form = new Forms.WriteEssay();
            if (mine != null) {
                form.setTitle(mine.title());
                form.setQuote(mine.quote());
                form.setBody(mine.body());
            }
            model.addAttribute("essayForm", form);
        }
        model.addAttribute("anthology", anthology);
        model.addAttribute("me", me);
        model.addAttribute("essay", mine);
        model.addAttribute("limits", Limits.INSTANCE);
        return "anthologies/write";
    }

    @PostMapping("/anthologies/{code}/essay")
    public String save(@PathVariable String code, @ModelAttribute("essayForm") Forms.WriteEssay form,
                       @RequestParam(defaultValue = "save") String action, HttpServletRequest request,
                       RedirectAttributes redirect) {
        boolean submit = "submit".equals(action);
        return attempt(redirect, "/anthologies/" + code + "/write", "essayForm", form, () -> {
            Essay essay = essayService.save(code, cookies.read(request, code), form.getTitle(), form.getQuote(),
                    form.getBody(), submit);
            if (submit) {
                redirect.addFlashAttribute("notice", "제출했어요! 이제 다른 사람의 독후감이 열려요.");
                return "redirect:/anthologies/" + code + "#shelf";
            }
            redirect.addFlashAttribute("notice", essay.isSubmitted() ? "고친 내용을 저장했어요." : "초안을 저장했어요.");
            return "redirect:/anthologies/" + code + "/write";
        });
    }

    @GetMapping("/anthologies/{code}/essays/{essayId}")
    public String read(@PathVariable String code, @PathVariable Long essayId, HttpServletRequest request,
                       Model model) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, cookies.read(request, code));
        Shelf shelf = essayService.shelf(anthology);
        Essay essay = EssayService.readable(shelf, me, essayId);

        List<Essay> order = shelf.submitted();
        int index = order.indexOf(essay);
        model.addAttribute("anthology", anthology);
        model.addAttribute("essay", essay);
        model.addAttribute("writer", shelf.writerOf(essay));
        model.addAttribute("replies", shelf.repliesOf(essay).stream()
                .map(reply -> new ReplyLine(shelf.anthology().contributorById(reply.contributorId()).byline(),
                        reply.body(), reply.createdAt()))
                .toList());
        model.addAttribute("canReply", essay.isSubmitted() && !essay.isWrittenBy(me.id()));
        model.addAttribute("previous", index > 0 ? order.get(index - 1) : null);
        model.addAttribute("next", index >= 0 && index < order.size() - 1 ? order.get(index + 1) : null);
        model.addAttribute("position", index + 1);
        model.addAttribute("total", order.size());
        return "anthologies/essay";
    }

    @PostMapping("/anthologies/{code}/essays/{essayId}/replies")
    public String reply(@PathVariable String code, @PathVariable Long essayId,
                        @RequestParam(required = false) String body, HttpServletRequest request,
                        RedirectAttributes redirect) {
        String back = "/anthologies/" + code + "/essays/" + essayId;
        return attempt(redirect, back, null, null, () -> {
            essayService.reply(code, cookies.read(request, code), essayId, body);
            return "redirect:" + back + "#replies";
        });
    }

    // ───────── 책 ─────────

    @GetMapping("/anthologies/{code}/book")
    public String book(@PathVariable String code, HttpServletRequest request, Model model) {
        Anthology anthology = anthologyService.get(code);
        String token = cookies.read(request, code);
        Contributor me = AnthologyService.requireContributor(anthology, token);
        if (!anthology.isClosed()) {
            return "redirect:/anthologies/" + code;
        }
        model.addAttribute("view", ShelfView.of(essayService.shelf(anthology), me, anthologyService.today()));
        model.addAttribute("aboutUrl", absolute("/anthologies/" + code + "/about"));
        try {
            model.addAttribute("manuscript", bookService.manuscript(code, token));
        } catch (DomainException e) {
            if (e.type() != ErrorType.RULE_VIOLATION) {
                throw e;
            }
            // 모두 책에서 뺐을 때. 화면은 보여 주고 다시 넣을 수 있게 한다.
            model.addAttribute("manuscriptProblem", e.getMessage());
        }
        return "anthologies/book";
    }

    @PostMapping("/anthologies/{code}/essays/{essayId}/inclusion")
    public String inclusion(@PathVariable String code, @PathVariable Long essayId, @RequestParam boolean included,
                            HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code + "/book", null, null, () -> {
            essayService.changeInclusion(code, cookies.read(request, code), essayId, included);
            return "redirect:/anthologies/" + code + "/book#toc";
        });
    }

    @GetMapping("/anthologies/{code}/book.epub")
    public ResponseEntity<byte[]> download(@PathVariable String code, HttpServletRequest request) {
        BookService.Book book = bookService.epub(code, cookies.read(request, code));
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(book.fileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(EPUB)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(book.content());
    }

    /**
     * 공개 소개 페이지. 마감한 문집의 도서 소개와 목차(지은이·글 제목)만 보여 준다. 본문은 없다.
     * "남의 독후감이 궁금해서 산다"의 입구.
     */
    @GetMapping("/anthologies/{code}/about")
    public String about(@PathVariable String code, Model model) {
        Anthology anthology = anthologyService.get(code);
        if (!anthology.isClosed()) {
            throw DomainException.notFound("아직 공개되지 않은 문집이에요.");
        }
        model.addAttribute("anthology", anthology);
        model.addAttribute("manuscript", bookService.publicContents(anthology).orElse(null));
        return "anthologies/about";
    }

    // ───────── 이어 하기 ─────────

    /** 개인 링크로 다른 기기에서 이어 하기. 쿠키를 다시 심고 문집으로 보낸다. */
    @GetMapping("/me/{token}")
    public String resume(@PathVariable String token, HttpServletRequest request, HttpServletResponse response,
                         RedirectAttributes redirect) {
        Anthology anthology = anthologyService.getByToken(token);
        cookies.write(request, response, anthology.code(), token);
        redirect.addFlashAttribute("notice", "이 기기에서도 이어서 쓸 수 있어요.");
        return "redirect:/anthologies/" + anthology.code();
    }

    /**
     * 폼 제출을 시도하고, 규칙 위반·충돌이면 입력값과 메시지를 들고 원래 화면으로 돌아간다.
     * 권한·존재 오류는 공통 오류 화면으로 넘긴다.
     */
    private String attempt(RedirectAttributes redirect, String backTo, String formName, Object form,
                           Supplier<String> action) {
        try {
            return action.get();
        } catch (DomainException e) {
            if (e.type() == ErrorType.RULE_VIOLATION || e.type() == ErrorType.CONFLICT) {
                return back(redirect, backTo, formName, form, e.getMessage());
            }
            throw e;
        }
    }

    private String back(RedirectAttributes redirect, String backTo, String formName, Object form, String message) {
        redirect.addFlashAttribute("error", message);
        if (formName != null) {
            redirect.addFlashAttribute(formName, form);
        }
        return "redirect:" + backTo;
    }

    private String absolute(String path) {
        return ServletUriComponentsBuilder.fromCurrentContextPath().path(path).toUriString();
    }

    public record ReplyLine(String byline, String body, java.time.LocalDateTime createdAt) {
    }

    /** 템플릿에서 쓰는 글자 수 상한 */
    public enum Limits {
        INSTANCE;

        public int titleMax() { return Essay.TITLE_MAX; }
        public int quoteMax() { return Essay.QUOTE_MAX; }
        public int bodyMin() { return Essay.BODY_MIN; }
        public int bodyMax() { return Essay.BODY_MAX; }
    }
}
