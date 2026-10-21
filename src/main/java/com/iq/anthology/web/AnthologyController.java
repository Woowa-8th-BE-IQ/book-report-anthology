package com.iq.anthology.web;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.AnthologyService.Admission;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.book.BookService;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.room.RoomService;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
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

@Controller
public class AnthologyController extends FormSupport {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final AnthologyService anthologyService;
    private final EssayService essayService;
    private final BookService bookService;
    private final RoomService roomService;
    private final ContributorCookies cookies;

    public AnthologyController(AnthologyService anthologyService, EssayService essayService, BookService bookService,
                               RoomService roomService, ContributorCookies cookies) {
        this.roomService = roomService;
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
        anthologyService.seen(me);
        Shelf shelf = essayService.shelf(anthology);
        ShelfView view = ShelfView.of(shelf, me, anthologyService.today(), anthologyService.now(),
                me == null ? java.util.Set.of() : roomService.online(anthology));
        String inviteUrl = absolute("/anthologies/" + code);
        model.addAttribute("view", view);
        model.addAttribute("inviteUrl", inviteUrl);
        model.addAttribute("aboutUrl", absolute("/anthologies/" + code + "/about"));
        if (me != null) {
            model.addAttribute("personalUrl", absolute("/me/" + me.token()));
            model.addAttribute("roomOnline", roomService.onlineCount(anthology));
        }
        if (view.isEditor()) {
            model.addAttribute("funnel", essayService.funnel(shelf));
            model.addAttribute("nudge", view.nudge(inviteUrl));
        }
        if (!model.containsAttribute("joinForm")) {
            model.addAttribute("joinForm", new Forms.Join());
        }
        model.addAttribute("limits", Limits.INSTANCE);
        model.addAttribute("ogTitle", anthology.editor().nickname() + "님이 『" + anthology.bookTitle()
                + "』 독후감 문집에 초대했어요");
        model.addAttribute("ogDescription", anthology.contributors().size() + "명 참여 중 · "
                + "내 독후감을 내면 다른 사람의 글이 열려요.");
        return "anthologies/show";
    }

    // ───────── 독후감 쓰기·읽기 ─────────

    @GetMapping("/anthologies/{code}/write")
    public String write(@PathVariable String code, HttpServletRequest request, Model model) {
        Anthology anthology = anthologyService.get(code);
        Contributor me = AnthologyService.requireContributor(anthology, cookies.read(request, code));
        anthologyService.seen(me);
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
        model.addAttribute("savedAtMillis", mine == null ? 0 : epochMillis(mine.updatedAt()));
        model.addAttribute("limits", Limits.INSTANCE);
        return "anthologies/write";
    }

    @PostMapping("/anthologies/{code}/essay")
    public String save(@PathVariable String code, @ModelAttribute("essayForm") Forms.WriteEssay form,
                       @RequestParam(defaultValue = "save") String action, HttpServletRequest request,
                       RedirectAttributes redirect) {
        boolean submit = "submit".equals(action);
        return attempt(redirect, "/anthologies/" + code + "/write", "essayForm", form, () -> {
            String token = cookies.read(request, code);
            boolean firstSubmit = submit && !alreadySubmitted(code, token);
            Essay essay = essayService.save(code, token, form.getTitle(), form.getQuote(), form.getBody(), submit);
            if (submit) {
                if (firstSubmit) {
                    // 열리는 순간: 문집 화면이 잠긴 카드를 하나씩 풀어 보여 준다
                    redirect.addFlashAttribute("justUnlocked", true);
                } else {
                    redirect.addFlashAttribute("notice", "고친 내용을 저장했어요.");
                }
                return "redirect:/anthologies/" + code + "#shelf";
            }
            redirect.addFlashAttribute("notice", essay.isSubmitted() ? "고친 내용을 저장했어요." : "초안을 저장했어요.");
            return "redirect:/anthologies/" + code + "/write";
        });
    }

    private boolean alreadySubmitted(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        return anthology.findByToken(token)
                .map(me -> essayService.shelf(anthology).hasSubmitted(me))
                .orElse(false);
    }

    @GetMapping("/anthologies/{code}/essays/{essayId}")
    public String read(@PathVariable String code, @PathVariable Long essayId, HttpServletRequest request,
                       Model model) {
        EssayService.Reading reading = essayService.read(code, cookies.read(request, code), essayId);
        Shelf shelf = reading.shelf();
        Essay essay = reading.essay();
        Contributor me = reading.viewer();
        anthologyService.seen(me);

        List<Essay> order = shelf.submitted();
        int index = order.indexOf(essay);
        model.addAttribute("anthology", shelf.anthology());
        model.addAttribute("essay", essay);
        model.addAttribute("writer", shelf.writerOf(essay));
        model.addAttribute("replies", shelf.repliesOf(essay).stream()
                .map(reply -> new ReplyLine(shelf.anthology().contributorById(reply.contributorId()).byline(),
                        reply.body(), reply.createdAt()))
                .toList());
        model.addAttribute("mine", essay.isWrittenBy(me.id()));
        model.addAttribute("canReply", essay.isSubmitted() && !essay.isWrittenBy(me.id()));
        model.addAttribute("previous", previousReadable(order, index, shelf, me));
        model.addAttribute("next", nextReadable(order, index, shelf, me));
        model.addAttribute("position", index + 1);
        model.addAttribute("total", order.size());
        return "anthologies/essay";
    }

    private static Essay previousReadable(List<Essay> order, int index, Shelf shelf, Contributor me) {
        for (int i = index - 1; i >= 0; i--) {
            if (shelf.canRead(me, order.get(i))) {
                return order.get(i);
            }
        }
        return null;
    }

    private static Essay nextReadable(List<Essay> order, int index, Shelf shelf, Contributor me) {
        for (int i = index + 1; index >= 0 && i < order.size(); i++) {
            if (shelf.canRead(me, order.get(i))) {
                return order.get(i);
            }
        }
        return null;
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
        ShelfView view = ShelfView.of(essayService.shelf(anthology), me, anthologyService.today());
        model.addAttribute("view", view);
        model.addAttribute("aboutUrl", absolute("/anthologies/" + code + "/about"));
        model.addAttribute("limits", Limits.INSTANCE);
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
            return "redirect:/anthologies/" + code + "/book#mine";
        });
    }

    @PostMapping("/anthologies/{code}/essays/{essayId}/sample")
    public String sample(@PathVariable String code, @PathVariable Long essayId, @RequestParam boolean allowed,
                         HttpServletRequest request, RedirectAttributes redirect) {
        return attempt(redirect, "/anthologies/" + code + "/book", null, null, () -> {
            essayService.allowPublicSample(code, cookies.read(request, code), essayId, allowed);
            redirect.addFlashAttribute("notice", allowed
                    ? "공개 소개 페이지에 맛보기로 보여 줄 수 있게 했어요."
                    : "맛보기 공개를 거뒀어요.");
            return "redirect:/anthologies/" + code + "/book#mine";
        });
    }

    @GetMapping("/anthologies/{code}/book.epub")
    public ResponseEntity<byte[]> epub(@PathVariable String code, HttpServletRequest request) {
        return attachment(bookService.epub(code, cookies.read(request, code)));
    }

    @GetMapping("/anthologies/{code}/book.pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String code, HttpServletRequest request) {
        return attachment(bookService.pdf(code, cookies.read(request, code)));
    }

    private static ResponseEntity<byte[]> attachment(BookService.Book book) {
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(book.fileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(book.mediaType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(book.content());
    }

    /**
     * 공개 소개 페이지. 마감한 문집의 도서 소개와 목차, 쓴 사람이 동의한 맛보기 한 편.
     * "남의 독후감이 궁금해서 산다"의 입구.
     */
    @GetMapping("/anthologies/{code}/about")
    public String about(@PathVariable String code, Model model) {
        BookService.Showcase showcase = bookService.showcase(code);
        Anthology anthology = showcase.anthology();
        model.addAttribute("anthology", anthology);
        model.addAttribute("manuscript", showcase.manuscript());
        model.addAttribute("sample", showcase.sample());
        int count = showcase.manuscript() == null ? 0 : showcase.manuscript().pieces().size();
        model.addAttribute("ogTitle", anthology.title() + " · " + anthology.readLine());
        model.addAttribute("ogDescription", count + "명이 같은 책을 읽고 쓴 독후감 문집이에요.");
        return "anthologies/about";
    }

    // ───────── 이어 하기 ─────────

    /** 개인 링크로 다른 기기에서 이어 하기. 쿠키를 다시 심고 문집으로 보낸다. */
    /** 개인 링크. {@code ?to=pet}이면 데스크톱 펫 화면으로 보낸다(펫 앱이 이 링크로 연결한다). */
    @GetMapping("/me/{token}")
    public String resume(@PathVariable String token, @RequestParam(required = false) String to,
                         HttpServletRequest request, HttpServletResponse response, RedirectAttributes redirect) {
        Anthology anthology = anthologyService.getByToken(token);
        cookies.write(request, response, anthology.code(), token);
        if ("pet".equals(to)) {
            return "redirect:/anthologies/" + anthology.code() + "/pet";
        }
        redirect.addFlashAttribute("notice", "이 기기에서도 이어서 쓸 수 있어요.");
        return "redirect:/anthologies/" + anthology.code();
    }

    static long epochMillis(LocalDateTime time) {
        return time.atZone(SEOUL).toInstant().toEpochMilli();
    }

    public record ReplyLine(String byline, String body, LocalDateTime createdAt) {
    }

    /** 템플릿에서 쓰는 글자 수 상한 */
    public enum Limits {
        INSTANCE;

        public int titleMax() { return Essay.TITLE_MAX; }
        public int quoteMax() { return Essay.QUOTE_MAX; }
        public int bodyMin() { return Essay.BODY_MIN; }
        public int bodyMax() { return Essay.BODY_MAX; }
        public int introductionMax() { return Anthology.INTRODUCTION_MAX; }
        public int promptsMax() { return Anthology.PROMPTS_MAX; }
        public int promptLengthMax() { return Anthology.PROMPT_LENGTH_MAX; }
        public int appendixMax() { return Anthology.APPENDIX_MAX; }
    }
}
