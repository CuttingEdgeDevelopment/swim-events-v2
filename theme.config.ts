import { defineThemeConfig } from '@utils/defineThemeConfig'
import previewImage from '@assets/img/social-preview-image.png'
import logoImage from '@assets/img/logo.svg'

export default defineThemeConfig({
  name: 'Swim Events Countdown',
  id: 'swim-events-countdown',
  seo: {
    title: 'Swim Events Countdown',
    description: 'Swim Events Countdown is a stripped-back accessible Astro foundation.',
    image: previewImage,
  },
  logo: logoImage,
  colors: {
    primary: '#d648ff',
    secondary: '#00d1b7',
    neutral: '#b9bec4',
    outline: '#ff4500',
  },
  navigation: {
    darkmode: true,
    items: [
      {
              type: 'link',
              label: 'Home',
              href: '/',
            }
    ],
  },
  socials: [],
})
