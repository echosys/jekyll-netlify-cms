---
title: How to Embed Youtube Video in NextJs 13 Without SEO damage
date: '2023-08-17'
tags:
  - javascript
  - javascript-framework
  - next-js
  - react
  - typescript
  - web-development
header:
  overlay_image: /img/posts/pexels-photo-315934.jpeg
---


Youtube allows you to embed videos in your website. It is said that having a rich content (like a video) in your website can have a positive impact on your SEO score in the eyes of search engines like Google or Bing.

So I created a video for my experimental [Mood Recommendation AI](https://www.taranify.com), and tried to embed it in my website. I used the code I got from youtube. It gave me this code:

```
 <iframe
   width="100%"
   height="100%"
   src="https://www.youtube.com/embed/jzx9bpFXSzE"
   title="How Does Taranify Work?"
   frameBorder="0"
   allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
   allowFullScreen
   loading="lazy"
></iframe>
```

It's very easy, but the problem was it affected my core web vitals heavily in [PageSpeed tool](https://pagespeed.web.dev/):

![](https://programmerbyday.files.wordpress.com/2023/08/taranify-mobile-perf-current-copy.png?w=1024)

The Total Blocking Time is ridiculously high and that's because of all the scripts and contents that Youtube iframe is loading. I had even put `loading="lazy"` on iframe but it didn't make much difference!

## What is a Facade for Third-party Embeds ?

Third-party embeds (Youtube, Google maps, Vimeo, Social media, etc.) usually have some contents that are not crucial for end-user in the beginning.

One way is to defer them with Lazy Loading, another way is to replace them with a static image that looks very similar to the actual embedded element. And when user actually needs it (such as clicking on it), we dynamically load the actual element.

You can have a facade for an iFrame such as [lazyframe](https://github.com/vb/lazyframe) , for a Youtube video such as [this](https://github.com/paulirish/lite-youtube-embed) or [this](https://github.com/justinribeiro/lite-youtube) , for Vimeo such as [this](https://github.com/luwes/lite-vimeo-embed) , live chats , or even build your own facade with Javascript/Typescript.

How I Used Facade for Youtube Embed in NextJs 13?

[NextJs 13](https://nextjs.org/blog/next-13) introduced a new structure and ways of doing things. After searching and trying different npm packages, I decided to add [this package](https://github.com/ibrahimcesar/react-lite-youtube-embed):

```
npm i react-lite-youtube-embed
```
This package doesn't add its CSS by default, so add this on top of your page:
```
import "react-lite-youtube-embed/dist/LiteYouTubeEmbed.css";
```
Then, embed your Youtube video like this:
```
<LiteYouTubeEmbed
            id="jzx9bpFXSzE"
            title="How Does Taranify Work?"
            poster="maxresdefault"
/>
```
This is responsive by default and takes up 100% of width. Notice that I decided to use `poster="maxresdefault"` to load the facade image with the highest available resolution.

After than, my core web vitals assessment is like this:

![](https://programmerbyday.files.wordpress.com/2023/08/tailwind-mobile-perf-8-yt-embed-facade-copy.png?w=1024)

Voila!

It's a huge improvement (2110 ms). The page is blazingly fast and in face for the first time I got this assessment result:

![](https://programmerbyday.files.wordpress.com/2023/08/screenshot-2023-08-16-at-8.03.03-pm.png?w=720)

Which made me to thank Chromium for PageSpeed tool in this tweet:

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Such a satisfying feeling when I got this from PageSpeed for <a href="https://t.co/wPSr3BY3TE">https://t.co/wPSr3BY3TE</a> , Thank you <a href="https://twitter.com/ChromiumDev?ref_src=twsrc%5Etfw">@ChromiumDev</a> <a href="https://t.co/OgTwkVxnOj">pic.twitter.com/OgTwkVxnOj</a></p>&mdash; Arman ð» (@programmerByDay) <a href="https://twitter.com/programmerByDay/status/1691753073511895459?ref_src=twsrc%5Etfw">August 16, 2023</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

Thanks for reading. I hope it's been useful.

[Follow me on X](https://twitter.com/programmerByDay) for more tips and knowledge sharings.
