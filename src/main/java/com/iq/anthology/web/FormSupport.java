package com.iq.anthology.web;

import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.ErrorType;
import java.util.function.Supplier;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** 폼 컨트롤러 공통: PRG와 오류 처리. */
abstract class FormSupport {

    /**
     * 폼 제출을 시도하고, 규칙 위반·충돌이면 입력값과 메시지를 들고 원래 화면으로 돌아간다.
     * 권한·존재 오류는 공통 오류 화면으로 넘긴다.
     */
    protected String attempt(RedirectAttributes redirect, String backTo, String formName, Object form,
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

    protected String back(RedirectAttributes redirect, String backTo, String formName, Object form, String message) {
        redirect.addFlashAttribute("error", message);
        if (formName != null) {
            redirect.addFlashAttribute(formName, form);
        }
        return "redirect:" + backTo;
    }

    protected String absolute(String path) {
        return ServletUriComponentsBuilder.fromCurrentContextPath().path(path).toUriString();
    }
}
