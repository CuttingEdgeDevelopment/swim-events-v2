import { defineThemeConfig } from '@utils/defineThemeConfig'
import previewImage from '@assets/img/countdown-screenshot.png'

export default defineThemeConfig({
  name: 'Swim Events',
  id: 'swim-events-countdown',
  seo: {
    title: 'Swim Events Countdown',
    description: 'Countdowns to upcoming swimming events.',
    author: 'Nicolas Messer',
    image: previewImage,
  },
  logo: null,
  colors: {
    primary: '#0b5cad',
    secondary: '#c8102e',
    neutral: '#b9bec4',
    outline: '#c8102e',
  },
  navigation: {
    darkmode: true,
    items: [],
  },
  socials: [],
})
