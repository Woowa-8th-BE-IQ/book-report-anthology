package com.iq.anthology.book;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.AnthologyService;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.support.DomainException;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookService {

    private final AnthologyService anthologyService;
    private final EssayService essayService;

    public BookService(AnthologyService anthologyService, EssayService essayService) {
        this.anthologyService = anthologyService;
        this.essayService = essayService;
    }

    /** 원고 전문은 참여자만 본다. 밖에는 공개 소개 페이지(목차)만 보인다. */
    @Transactional(readOnly = true)
    public Manuscript manuscript(String code, String token) {
        Anthology anthology = anthologyService.get(code);
        AnthologyService.requireContributor(anthology, token);
        return ManuscriptFactory.compose(essayService.shelf(anthology));
    }

    /** 공개 소개 페이지용. 목차를 그리는 데만 쓴다. 실린 글이 없으면 비어 있다. */
    @Transactional(readOnly = true)
    public Optional<Manuscript> publicContents(Anthology anthology) {
        try {
            return Optional.of(ManuscriptFactory.compose(essayService.shelf(anthology)));
        } catch (DomainException e) {
            return Optional.empty();
        }
    }

    @Transactional(readOnly = true)
    public Book epub(String code, String token) {
        Manuscript manuscript = manuscript(code, token);
        return new Book(EpubWriter.fileName(manuscript), EpubWriter.write(manuscript));
    }

    public record Book(String fileName, byte[] content) {
    }
}
