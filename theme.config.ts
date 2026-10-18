import { defineThemeConfig } from '@utils/defineThemeConfig'
import previewImage from '@assets/img/countdown-screenshot.png'

export default defineThemeConfig({
  name: 'Swim Events Countdown',
  id: 'swim-events-countdown',
  seo: {
    title: 'Swim Events Countdown',
    description: 'Countdowns to upcoming swimming events.',
    author: 'Nicolas Messer',
    image: previewImage,
  },
  logo: null,
  colors: {
    primary: '#4f46e5',
    secondary: '#0ea5e9',
    neutral: '#b9bec4',
    outline: '#ff4500',
  },
  navigation: {
    darkmode: true,
    items: [],
  },
  socials: [],
})
