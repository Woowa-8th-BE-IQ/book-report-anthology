package com.iq.anthology.book;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.support.DomainException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 마감한 문집으로 원고를 엮는다. 글은 고치지 않고 순서와 출처만 정리한다. */
public final class ManuscriptFactory {

    private ManuscriptFactory() {
    }

    public static Manuscript compose(Shelf shelf) {
        return compose(shelf, List.of());
    }

    /** talks: 모임방에서 책갈피를 받아 책에 싣는 말(날짜별). */
    public static Manuscript compose(Shelf shelf, List<Manuscript.TalkDay> talks) {
        Anthology anthology = shelf.anthology();
        if (!anthology.isClosed()) {
            throw DomainException.rule("마감한 문집만 책으로 만들 수 있어요.");
        }
        List<Manuscript.Piece> pieces = new ArrayList<>();
        for (Essay essay : shelf.submitted()) {
            if (essay.includedInBook()) {
                pieces.add(new Manuscript.Piece(pieces.size() + 1, essay.title(),
                        shelf.writerOf(essay).byline(), essay.quote(), essay.body()));
            }
        }
        if (pieces.isEmpty()) {
            throw DomainException.rule("책에 넣을 독후감이 하나도 없어요. 최소 한 편은 넣어 주세요.");
        }
        return new Manuscript(identifierOf(anthology), anthology.title(), anthology.citation(),
                anthology.readLine(), anthology.introduction(), anthology.closedAt().toLocalDate(), pieces,
                anthology.prompts(), anthology.appendix(), talks);
    }

    /** 같은 문집은 다시 내려받아도 같은 식별자를 갖는다. */
    private static String identifierOf(Anthology anthology) {
        UUID uuid = UUID.nameUUIDFromBytes(("anthology:" + anthology.code()).getBytes(StandardCharsets.UTF_8));
        return "urn:uuid:" + uuid;
    }
}
