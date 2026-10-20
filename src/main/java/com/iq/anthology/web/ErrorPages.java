package com.iq.anthology.web;

import com.iq.anthology.support.DomainException;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.ui.Model;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** 화면용 오류 처리. 상태 코드는 오류 종류가 정한다(404/403/409/422). */
@ControllerAdvice
public class ErrorPages {

    @ExceptionHandler(DomainException.class)
    public String domain(DomainException e, HttpServletResponse response, Model model) {
        return render(response, model, e.type().status(), e.getMessage());
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public String badRequest(HttpServletResponse response, Model model) {
        return render(response, model, 400, "요청 형식이 올바르지 않아요.");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public String notFound(HttpServletResponse response, Model model) {
        return render(response, model, 404, "찾는 페이지가 없어요.");
    }

    private String render(HttpServletResponse response, Model model, int status, String message) {
        response.setStatus(status);
        model.addAttribute("status", status);
        model.addAttribute("message", message);
        return "error";
    }
}
