import { defineThemeConfig } from '@utils/defineThemeConfig'
import previewImage from '@assets/img/social-preview.png'

export default defineThemeConfig({
  name: 'Swim Events',
  id: 'swim-events-countdown',
  seo: {
    title: 'Swim Events Calendar',
    description: 'Upcoming swimming competitions, with a countdown to each one.',
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
    items: [
      { label: 'About', href: '/about' },
      // signed-out visitors get the call to action; signed-in organisers find it on their account page
      { label: 'Submit an event', href: '/submit', button: true, show: 'signed-out' },
      { label: 'Account', href: '/account', show: 'signed-in' },
    ],
  },
  socials: [],
})
