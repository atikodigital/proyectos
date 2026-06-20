import * as React from "react";
import { Instagram, Twitter, Github, ChevronDown } from "lucide-react";

const ULogo = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 29.667 31.69"
    {...props}
  >
    <path d="M12.827,1.628A1.561,1.561,0,0,1,14.31,0h2.964a1.561,1.561,0,0,1,1.483,1.628v11.9a9.252,9.252,0,0,1-2.432,6.852q-2.432,2.409-6.963,2.409T2.4,20.452Q0,18.094,0,13.669V1.628A1.561,1.561,0,0,1,1.483,0h2.98A1.561,1.561,0,0,1,5.947,1.628V13.191a5.635,5.635,0,0,0,.85,3.451,3.153,3.153,0,0,0,2.632,1.094,3.032,3.032,0,0,0,2.582-1.076,5.836,5.836,0,0,0,.816-3.486Z" />
    <path d="M75.207,20.857a1.561,1.561,0,0,1-1.483,1.628h-2.98a1.561,1.561,0,0,1-1.483-1.628V1.628A1.561,1.561,0,0,1,70.743,0h2.98a1.561,1.561,0,0,1,1.483,1.628Z" transform="translate(-45.91 0)" />
    <path d="M0,80.018A1.561,1.561,0,0,1,1.483,78.39h26.7a1.561,1.561,0,0,1,1.483,1.628v2.006a1.561,1.561,0,0,1-1.483,1.628H1.483A1.561,1.561,0,0,1,0,82.025Z" transform="translate(0 -51.963)" />
  </svg>
);

const GlassCard = React.forwardRef(
  ({ className, title = "Monochrome", description = "Create, share...", icon: Icon, href = "#", ...props }, ref) => {
    const parts = title.split('. ');
    const hasNumber = parts.length > 1 && /^\d+$/.test(parts[0]);

    return (
      <div
        ref={ref}
        className={`group h-[300px] w-[290px] [perspective:1000px] ${className}`}
        {...props}
      >
        <div className="relative h-full rounded-[50px] bg-gradient-to-br from-zinc-900 to-black shadow-2xl transition-all duration-500 ease-in-out [transform-style:preserve-3d] group-hover:[box-shadow:0_30px_60px_-20px_rgba(0,0,0,0.7),0_0_50px_-10px_rgba(252,163,17,0.22)] group-hover:[transform:rotate3d(1,1,0,25deg)]">
          <div className="absolute inset-2 rounded-[55px] border-b border-l border-white/20 bg-gradient-to-b from-white/30 to-white/10 backdrop-blur-sm [transform-style:preserve-3d] [transform:translate3d(0,0,25px)]"></div>
          <div className="absolute [transform:translate3d(0,0,26px)]">
            <div className="px-7 pt-[85px] pb-0">
              <span className="block text-lg font-black text-white font-sans leading-tight">
                {hasNumber && <span className="text-[#FCA311] mr-1">{parts[0]}.</span>}
                {hasNumber ? parts.slice(1).join('. ') : title}
              </span>
              <span className="mt-4 block text-[13px] text-zinc-300 font-sans leading-snug">
                {description}
              </span>
            </div>
          </div>
          <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between [transform-style:preserve-3d] [transform:translate3d(0,0,26px)]">
            <div className="flex gap-2.5 [transform-style:preserve-3d]">
              {[
                { icon: Instagram, delay: "400ms" },
                { icon: Twitter, delay: "600ms" },
                { icon: Github, delay: "800ms" },
              ].map(({ icon: IconComponent, delay }, index) => (
                <button
                  key={index}
                  className="group/social grid h-[30px] w-[30px] place-content-center rounded-full border border-white/15 bg-white/10 shadow-[rgba(0,0,0,0.5)_0px_7px_5px_-5px] transition-all duration-200 ease-in-out group-hover:[box-shadow:rgba(0,0,0,0.2)_-5px_20px_10px_0px] group-hover:[transform:translate3d(0,0,50px)] hover:bg-[#FCA311] hover:border-[#FCA311] active:bg-[#e08f0d]"
                  style={{ transitionDelay: delay }}
                >
                  <IconComponent className="h-4 w-4 stroke-white group-hover/social:stroke-black transition-colors" />
                </button>
              ))}
            </div>
            <a
              href={href}
              className="flex w-2/5 cursor-pointer items-center justify-end transition-all duration-200 ease-in-out hover:[transform:translate3d(0,0,10px)]"
            >
              <button className="border-none bg-none text-xs font-bold text-[#FCA311] font-sans">
                Ver más
              </button>
              <ChevronDown className="h-4 w-4 stroke-[#FCA311] ml-0.5" strokeWidth={3} />
            </a>
          </div>
          <div className="absolute top-0 right-0 [transform-style:preserve-3d]">
            {[
              { size: "170px", pos: "8px", z: "20px", delay: "0s" },
              { size: "140px", pos: "10px", z: "40px", delay: "0.4s" },
              { size: "110px", pos: "17px", z: "60px", delay: "0.8s" },
              { size: "80px", pos: "23px", z: "80px", delay: "1.2s" },
            ].map((circle, index) => (
              <div
                key={index}
                className="absolute aspect-square rounded-full bg-[#FCA311]/10 shadow-[rgba(252,163,17,0.05)_0px_10px_20px_0px] transition-all duration-500 ease-in-out"
                style={{
                  width: circle.size,
                  top: circle.pos,
                  right: circle.pos,
                  transform: `translate3d(0, 0, ${circle.z})`,
                  transitionDelay: circle.delay,
                }}
              ></div>
            ))}
            <div
              className="absolute grid aspect-square w-[50px] place-content-center rounded-full bg-[#FCA311] shadow-[rgba(252,163,17,0.3)_0px_10px_20px_-5px] transition-all duration-500 ease-in-out [transform:translate3d(0,0,100px)] [transition-delay:1.6s] group-hover:[transform:translate3d(0,0,120px)]"
              style={{ top: "30px", right: "30px" }}
            >
              {Icon ? (
                <Icon className="w-5 h-5 text-black stroke-black" strokeWidth={2.5} />
              ) : (
                <ULogo className="w-5 fill-black" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";

export default GlassCard;
export { GlassCard };
