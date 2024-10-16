---
title: 'How to add cookie consent in Nextjs, Tailwind CSS and DaisyUI'
tags:
  - next-js
  - typescript
  - javascript
  - web-development
published: true
date: '2023-11-26'
---
Cookie consent on websites refers to the practice of asking users for permission to collect and use their data through cookies.

Cookies are small pieces of data stored on a user's device when they visit a website. They are used for various purposes, such as tracking user activity, remembering login details, and personalizing content.

Laws in various parts of the world, such as the General Data Protection Regulation (_GDPR_) in the European Union and the _ePrivacy_ Directive, _LGPD_ in Brazil, _POPIA_ in South Africa require websites to obtain explicit consent from users before placing cookies on their devices. This is to protect user privacy and give them control over their personal data.

To comply with these laws, websites, especially those with a global audience, even if a website is based outside of the EU, need to implement a clear and easily accessible cookie consent mechanism. This typically involves a popup or banner informing users about the use of cookies and requesting their consent.

## How to Implement that in Nextjs

I use this NPM library:

> npm install cookies-next

This gives us two useful functions: `hasCookie` & `setCookie`. In a top-level client-side layout page, I check if a consent cookie present or not. If not, I show the message to the user. Once the user accepts it, I save the consent cookie so that next time I don't bother user and repeat this question again.

Import these at top:

```typescript
import { hasCookie, setCookie } from "cookies-next";
```

Create this state:

```javascript
const [showConsent, setShowConsent] = useState(false);
```

In useEffect method do this:

```javascript
useEffect(() => {
   setShowConsent(!hasCookie("cookieConsent"));
  }, []);
```

In the return section add this JSX code:

```javascript
{showConsent && (
        <Toast className="z-50">
          <Alert>
            <div className="w-full flex-row justify-between gap-2">
              <span>
                We use cookies in this website.
              </span>
            </div>
            <Button size="sm" color="primary" onClick={() => {
		setCookie("cookieConsent", "true", {});
		setShowConsent(false);
		}}>
              Accept
            </Button>
          </Alert>
        </Toast>
      )}
```

Voila! as simple as that.

**Note:** I'm using [DaisyUI](https://daisyui.com/) which is a UI library on top of [Tailwind CSS](https://tailwindcss.com/). You can do the same with solely tailwind css as well.
