import React from 'react';
import './Hero.css';
import mastersHero from '../assets/masters-hero.png';

interface HeroProps {
  botUrl: string;
}

const Hero: React.FC<HeroProps> = ({ botUrl }) => {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="hero">
      <div className="hero__container">
        {/* Left column: content */}
        <div className="hero__content">
          <div className="hero__badge">
            ● IT-платформа для профессиональных мастеров
          </div>

          <h1 className="hero__title">
            Заказы для мастеров.<br />
            <span>Без хаоса.</span><br />
            Через систему.
          </h1>

          <p className="hero__text">
            Обои, шпаклёвка, покраска, плитка, санузлы, отделка —
            берите реальные объекты через приложение и работайте по понятным правилам.
          </p>

          <div className="hero__features">
            <div>⚡ Объекты каждый день</div>
            <div>✓ Смета и бронь в приложении</div>
            <div>↗ 100% стоимости — ваши</div>
          </div>

          <div>
            <a href={botUrl} className="hero__btn">
              Начать работать
            </a>
            <button
              className="hero__btn--ghost"
              onClick={() => scrollToSection('how-it-works')}
            >
              Узнать условия
            </button>
          </div>
        </div>

        {/* Right column: visual */}
        <div className="hero__visual">
          <div className="card order-card">
            <small>Новый заказ</small>
            <h4>Квартира 85 м²</h4>
            <p>Бюджет 1 350 000 ₽</p>
            <button>Откликнуться</button>
          </div>

          <img
            src={mastersHero}
            alt="Честный мастер"
            className="hero__image"
          />

          <div className="card income-card">
            <small>Заработок</small>
            <h3>+84 000 ₽</h3>
          </div>

          <div className="card rating-card">
            <small>Рейтинг</small>
            <h3>⭐ 4.9</h3>
          </div>

          <div className="card success-card">
            <span>✅</span>
            <div>
              <strong>Объект взят</strong>
              <p>Обои, 3-комн. кв.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
