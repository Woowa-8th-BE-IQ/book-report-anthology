package com.iq.anthology.book;

import com.iq.anthology.activity.ActivityLog;
import com.iq.anthology.activity.ActivityType;
import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.support.DomainException;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookService {

    private final AnthologyService anthologyService;
    private final EssayService essayService;
    private final ActivityLog activityLog;
    private final com.iq.anthology.room.RoomMessageRepository talks;

    public BookService(AnthologyService anthologyService, EssayService essayService, ActivityLog activityLog,
                       com.iq.anthology.room.RoomMessageRepository talks) {
        this.anthologyService = anthologyService;
        this.essayService = essayService;
        this.activityLog = activityLog;
        this.talks = talks;
    }

    private static final java.time.format.DateTimeFormatter DAY = java.time.format.DateTimeFormatter.ofPattern("M월 d일");

    /** 책의 "함께 나눈 이야기": 모임방에서 책갈피를 받은 말 중, 싣기를 거절하지 않은 사람의 말을 날짜별로. */
    java.util.List<Manuscript.TalkDay> talksOf(Anthology anthology) {
        java.util.Set<Long> optOuts = talks.chatOptOuts(anthology.id());
        java.util.Map<Long, Contributor> people = new java.util.HashMap<>();
        anthology.contributors().forEach(contributor -> people.put(contributor.id(), contributor));
        var marked = talks.bookmarked(anthology.id());
        var marks = talks.bookmarkers(marked.stream().map(com.iq.anthology.room.RoomMessage::id).toList());
        java.util.Map<String, java.util.List<Manuscript.TalkLine>> days = new java.util.LinkedHashMap<>();
        for (var message : marked) {
            Contributor speaker = people.get(message.contributorId());
            if (speaker == null || optOuts.contains(speaker.id())) {
                continue;
            }
            days.computeIfAbsent(message.createdAt().format(DAY), day -> new java.util.ArrayList<>())
                    .add(new Manuscript.TalkLine(speaker.byline(), message.body(),
                            marks.getOrDefault(message.id(), java.util.List.of()).size()));
        }
        return days.entrySet().stream().map(day -> new Manuscript.TalkDay(day.getKey(), day.getValue())).toList();
    }

    /** 원고 전문은 참여자만 본다. 밖에는 공개 소개 페이지(목차와 동의한 맛보기 한 편)만 보인다. */
    @Transactional(readOnly = true)
    public Manuscript manuscript(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        AnthologyService.requireContributor(anthology, token);
        return ManuscriptFactory.compose(essayService.shelf(anthology), talksOf(anthology));
    }

    /** 공개 소개 페이지. 목차와, 쓴 사람이 동의한 맛보기 한 편. 방문을 기록한다. */
    @Transactional
    public Showcase showcase(String code) {
        Anthology anthology = anthologyService.get(code);
        if (!anthology.isClosed()) {
            throw DomainException.notFound("아직 공개되지 않은 문집이에요.");
        }
        Shelf shelf = essayService.shelf(anthology);
        Manuscript manuscript = null;
        try {
            manuscript = ManuscriptFactory.compose(shelf);
        } catch (DomainException e) {
            // 모두 책에서 뺐다. 목차 없이 소개만 보여 준다.
        }
        Optional<Essay> sample = shelf.publicSample();
        activityLog.record(anthology.id(), null, ActivityType.ABOUT_VIEWED, null);
        return new Showcase(anthology, manuscript,
                sample.map(essay -> new Sample(shelf.writerOf(essay).byline(), essay)).orElse(null));
    }

    @Transactional
    public Book epub(String code, String token) {
        Download download = download(code, token, ActivityType.EPUB_DOWNLOADED);
        return new Book(EpubWriter.fileName(download.manuscript()), EpubWriter.write(download.manuscript()),
                "application/epub+zip");
    }

    @Transactional
    public Book pdf(String code, String token) {
        Download download = download(code, token, ActivityType.PDF_DOWNLOADED);
        return new Book(PdfBook.fileName(download.manuscript()), PdfBook.write(download.manuscript()),
                "application/pdf");
    }

    private Download download(String code, String token, ActivityType type) {
        Anthology anthology = anthologyService.get(code);
        Contributor reader = AnthologyService.requireContributor(anthology, token);
        Manuscript manuscript = ManuscriptFactory.compose(essayService.shelf(anthology), talksOf(anthology));
        activityLog.record(anthology.id(), reader.id(), type, null);
        return new Download(manuscript);
    }

    private record Download(Manuscript manuscript) {
    }

    public record Book(String fileName, byte[] content, String mediaType) {
    }

    /** 공개 소개 페이지에 그릴 것. manuscript와 sample은 없을 수 있다. */
    public record Showcase(Anthology anthology, Manuscript manuscript, Sample sample) {
    }

    public record Sample(String byline, Essay essay) {
    }
}
