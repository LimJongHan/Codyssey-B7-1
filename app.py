"""
해피(Happi) AI 긍정 메이트 - 웹 애플리케이션 엔트리포인트 (Flask + Jinja2)
팀 과제 프론트엔드 및 시연 서버
"""

import os
from flask import Flask, render_template, request, redirect, url_for, session

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "happi-positive-secret-key-2026")


@app.route("/")
def index():
    """메인 라우트 - 기본 채팅 화면으로 진입"""
    return redirect(url_for("chat_page"))


@app.route("/chat")
def chat_page():
    """Page 2. 메인 챗봇 대화 및 아카이브 페이지"""
    is_logged_in = session.get("is_logged_in", False)
    user_name = session.get("user_name", "게스트")
    user_email = session.get("user_email", "")

    return render_template(
        "pages/chat.html",
        is_logged_in=is_logged_in,
        user_name=user_name,
        user_email=user_email,
    )


@app.route("/auth")
def auth_page():
    """Page 1. 로그인 및 회원가입 페이지"""
    return render_template("pages/auth.html")


@app.route("/login", methods=["POST"])
def login():
    """로그인 처리"""
    email = request.form.get("email", "user@example.com")
    name = email.split("@")[0] or "민수"
    session["is_logged_in"] = True
    session["user_name"] = name
    session["user_email"] = email
    return redirect(url_for("chat_page"))


@app.route("/register", methods=["POST"])
def register():
    """회원가입 처리"""
    name = request.form.get("name", "지우")
    email = request.form.get("email", "user@example.com")
    session["is_logged_in"] = True
    session["user_name"] = name
    session["user_email"] = email
    return redirect(url_for("chat_page"))


@app.route("/guest")
def guest_chat():
    """비로그인 게스트 모드 진입"""
    session.clear()
    session["is_logged_in"] = False
    return redirect(url_for("chat_page"))


@app.route("/logout")
def logout():
    """로그아웃"""
    session.clear()
    return redirect(url_for("auth_page"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5055))
    print(f"☀️ 해피 AI 긍정봇 웹 서버 시작: http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
