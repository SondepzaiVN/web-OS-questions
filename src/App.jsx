import { useEffect, useMemo, useState } from "react";
import "./App.css";

const questionModules = import.meta.glob("../Question/**/*.json", {
  eager: true,
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const shuffle = (items) => {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

const buildTopics = () => {
  const entries = Object.entries(questionModules);
  return entries
    .map(([path, module]) => {
      const relative = path.split("/Question/")[1];
      if (!relative) {
        return null;
      }
      const [chapter, filename] = relative.split("/");
      if (!chapter || !filename) {
        return null;
      }
      const topic = filename.replace(/\.json$/i, "");
      const questions = module.default ?? module;
      return {
        id: `${chapter}::${topic}`,
        chapter,
        topic,
        questions: Array.isArray(questions) ? questions : [],
      };
    })
    .filter(Boolean);
};

const buildQuestionSet = (topics, desiredCount) => {
  if (!topics.length || desiredCount <= 0) {
    return [];
  }

  const counts = topics.map(() => 0);
  let remaining = desiredCount;
  let madeProgress = true;

  while (remaining > 0 && madeProgress) {
    madeProgress = false;
    for (let i = 0; i < topics.length && remaining > 0; i += 1) {
      if (counts[i] < topics[i].questions.length) {
        counts[i] += 1;
        remaining -= 1;
        madeProgress = true;
      }
    }
  }

  const picked = topics.flatMap((topic, index) => {
    const list = shuffle(topic.questions).slice(0, counts[index]);
    return list.map((item, itemIndex) => {
      const originalOptions = ["a", "b", "c", "d"]
        .filter((key) =>
          Object.prototype.hasOwnProperty.call(item.options || {}, key),
        )
        .map((key) => ({
          originalKey: key,
          text: item.options[key],
        }));
      const shuffled = shuffle(originalOptions);
      const labelOrder = ["a", "b", "c", "d"];
      const options = shuffled.map((option, index) => ({
        key: labelOrder[index],
        text: option.text,
        originalKey: option.originalKey,
      }));
      const mappedAnswer =
        options.find((option) => option.originalKey === item.answer)?.key ??
        item.answer;
      return {
        id: `${topic.id}-${item.id ?? itemIndex}`,
        question: item.question,
        options,
        answer: mappedAnswer,
        explanation: item.explanation,
        chapter: topic.chapter,
        topic: topic.topic,
      };
    });
  });

  return shuffle(picked);
};

function App() {
  const topics = useMemo(() => buildTopics(), []);
  const [selectedTopics, setSelectedTopics] = useState(() =>
    topics.map((topic) => topic.id),
  );
  const [questionCount, setQuestionCount] = useState(30);
  const [phase, setPhase] = useState("setup");
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const groupedTopics = useMemo(() => {
    return topics.reduce((acc, topic) => {
      if (!acc[topic.chapter]) {
        acc[topic.chapter] = [];
      }
      acc[topic.chapter].push(topic);
      return acc;
    }, {});
  }, [topics]);

  const selectedTopicItems = useMemo(() => {
    return topics.filter((topic) => selectedTopics.includes(topic.id));
  }, [topics, selectedTopics]);

  const maxAvailable = selectedTopicItems.reduce(
    (total, topic) => total + topic.questions.length,
    0,
  );

  const answeredCount = Object.keys(answers).length;
  const allAnswered =
    quizQuestions.length > 0 && answeredCount === quizQuestions.length;
  const allSelected = selectedTopics.length === topics.length;
  const lastIndex = Math.max(quizQuestions.length - 1, 0);
  const currentQuestion = quizQuestions[currentIndex];
  const isReview = timeUp || allAnswered;
  const statusLabel = timeUp
    ? "Hết giờ"
    : allAnswered
      ? "Hoàn thành"
      : "Đang thi";
  const getMaxAvailable = (topicIds) =>
    topics
      .filter((topic) => topicIds.includes(topic.id))
      .reduce((total, topic) => total + topic.questions.length, 0);

  useEffect(() => {
    if (phase !== "quiz") {
      return undefined;
    }
    if (allAnswered) {
      return undefined;
    }
    if (remainingSeconds <= 0) {
      return undefined;
    }
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setTimeUp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, remainingSeconds, allAnswered]);

  const handleToggleTopic = (topicId) => {
    setSelectedTopics((prev) => {
      const next = prev.includes(topicId)
        ? prev.filter((id) => id !== topicId)
        : [...prev, topicId];
      const nextMax = getMaxAvailable(next);
      setQuestionCount((current) =>
        clamp(current || 1, 1, Math.max(nextMax, 1)),
      );
      return next;
    });
  };

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedTopics([]);
      setQuestionCount((current) => clamp(current || 1, 1, 1));
      return;
    }
    const next = topics.map((topic) => topic.id);
    setSelectedTopics(next);
    const nextMax = getMaxAvailable(next);
    setQuestionCount((current) => clamp(current || 1, 1, Math.max(nextMax, 1)));
  };

  const handleStart = () => {
    if (maxAvailable === 0) {
      return;
    }
    const desired = clamp(Number(questionCount) || 1, 1, maxAvailable);
    const questions = buildQuestionSet(selectedTopicItems, desired);
    setQuizQuestions(questions);
    setAnswers({});
    setRemainingSeconds(desired * 60);
    setTimeUp(false);
    setShowReview(false);
    setCurrentIndex(0);
    setPhase("quiz");
  };

  const handleSelect = (questionIndex, optionKey) => {
    if (isReview || phase !== "quiz" || answers[questionIndex]) {
      return;
    }
    setAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionKey,
    }));
  };

  const handleReset = () => {
    setPhase("setup");
    setQuizQuestions([]);
    setAnswers({});
    setRemainingSeconds(0);
    setTimeUp(false);
    setShowReview(false);
    setCurrentIndex(0);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, lastIndex));
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-title">
          <h1>
            Trắc nghiệm <br />
            Nguyên lý Hệ Điều Hành
            <span className="title-sub">Cô Khang</span>
          </h1>
        </div>
        <div className="hero-meta">
          <p className="author">Phát triển bởi Đặng Lam Sơn</p>
        </div>
      </header>

      {phase === "setup" ? (
        <section className="panel setup">
          <div className="field">
            <label htmlFor="question-count">Số câu hỏi</label>
            <div className="input-row">
              <input
                id="question-count"
                type="number"
                min={maxAvailable ? "1" : "0"}
                max={maxAvailable}
                value={questionCount}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  const next = clamp(raw || 1, 1, Math.max(maxAvailable, 1));
                  setQuestionCount(next);
                }}
              />
              <span className="hint">Tối đa {maxAvailable || 0} câu</span>
            </div>
          </div>

          <div className="field">
            <label>Chọn phần kiến thức</label>
            <button
              className="dropdown-trigger"
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
            >
              <span>
                {allSelected
                  ? "Tất cả chủ đề"
                  : `Đã chọn ${selectedTopics.length} / ${topics.length}`}
              </span>
              <span className="chevron">{isDropdownOpen ? "▲" : "▼"}</span>
            </button>
            {isDropdownOpen && (
              <div className="dropdown">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleToggleAll}
                  />
                  <span>Tất cả</span>
                </label>
                {Object.entries(groupedTopics).map(
                  ([chapter, chapterTopics]) => (
                    <div key={chapter} className="dropdown-group">
                      <p className="group-title">{chapter}</p>
                      {chapterTopics.map((topic) => (
                        <label key={topic.id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedTopics.includes(topic.id)}
                            onChange={() => handleToggleTopic(topic.id)}
                          />
                          <span>{topic.topic}</span>
                        </label>
                      ))}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <button
            className="primary"
            type="button"
            onClick={handleStart}
            disabled={!maxAvailable}
          >
            Bắt đầu làm bài
          </button>
        </section>
      ) : (
        <section className="quiz">
          <div className="panel quiz-header">
            <div>
              <p className="meta-label">Thời gian còn lại</p>
              <p className={`timer ${remainingSeconds <= 60 ? "urgent" : ""}`}>
                {formatTime(remainingSeconds)}
              </p>
            </div>
            <div>
              <p className="meta-label">Tiến độ</p>
              <p className="meta-value">
                {answeredCount} / {quizQuestions.length}
              </p>
              <p className="meta-sub">
                Câu {currentIndex + 1} / {quizQuestions.length}
              </p>
            </div>
            <div>
              <p className="meta-label">Chế độ</p>
              <p className="meta-value">{statusLabel}</p>
            </div>
            <button className="ghost" type="button" onClick={handleReset}>
              Tạo bài mới
            </button>
          </div>

          {timeUp && (
            <div className="notice danger">
              Hết thời gian làm bài. Hãy xem lại các câu đã trả lời.
            </div>
          )}
          {allAnswered && !timeUp && (
            <div className="notice success">
              Hoàn thành bài thi, chúc các bạn thi tốt.
            </div>
          )}

          {currentQuestion && (
            <div className="question-single">
              <article className="question-card">
                <div className="question-meta">
                  <span className="index">Câu {currentIndex + 1}</span>
                  <span className="topic">
                    {currentQuestion.chapter} / {currentQuestion.topic}
                  </span>
                </div>
                <h3>{currentQuestion.question}</h3>
                <div className="options">
                  {currentQuestion.options.map((option) => {
                    const selectedAnswer = answers[currentIndex];
                    const isChosen = selectedAnswer === option.key;
                    const isCorrect =
                      selectedAnswer && option.key === currentQuestion.answer;
                    const isWrong =
                      selectedAnswer &&
                      option.key === selectedAnswer &&
                      option.key !== currentQuestion.answer;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`option ${isChosen ? "picked" : ""} ${
                          isCorrect ? "correct" : ""
                        } ${isWrong ? "wrong" : ""}`}
                        onClick={() => handleSelect(currentIndex, option.key)}
                        disabled={isReview || Boolean(selectedAnswer)}
                      >
                        <span className="opt-key">
                          {option.key.toUpperCase()}
                        </span>
                        <span className="opt-text">{option.text}</span>
                      </button>
                    );
                  })}
                </div>
                {answers[currentIndex] && (
                  <details className="explain" open>
                    <summary>Giải thích</summary>
                    <p>{currentQuestion.explanation}</p>
                  </details>
                )}
              </article>

              <div className="question-nav">
                <button
                  className="ghost"
                  type="button"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                >
                  Quay lại
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={handleNext}
                  disabled={currentIndex === lastIndex}
                >
                  Câu tiếp theo
                </button>
              </div>
            </div>
          )}

          {currentIndex === lastIndex && (
            <div className="quiz-actions">
              <button
                className="primary"
                type="button"
                onClick={() => setShowReview((prev) => !prev)}
                disabled={!answeredCount}
              >
                {showReview ? "Ẩn tổng kết" : "Xem tổng kết"}
              </button>
            </div>
          )}

          {showReview && (
            <section className="panel review">
              <h2>Tổng kết đã trả lời</h2>
              <div className="review-grid">
                {quizQuestions.map((item, index) => {
                  const selectedAnswer = answers[index];
                  const isCorrect = selectedAnswer === item.answer;
                  return (
                    <div key={`${item.id}-review`} className="review-item">
                      <p className="review-index">Câu {index + 1}</p>
                      <p className="review-question">{item.question}</p>
                      <p
                        className={`review-answer ${isCorrect ? "correct" : "wrong"}`}
                      >
                        Trả lời:{" "}
                        {selectedAnswer
                          ? selectedAnswer.toUpperCase()
                          : "Chưa trả lời"}
                      </p>
                      <p className="review-answer">
                        Đáp án đúng: {item.answer.toUpperCase()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
