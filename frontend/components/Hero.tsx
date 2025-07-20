
import { AuroraBackground } from '@/components/ui/aurora-background'
import React from 'react'

const Hero = () => {
  return (
    <AuroraBackground>
        <section aria-label="hero" className="w-screen h-full bg-transparent z-[10]">
        <div className="flex flex-col items-center justify-center h-full w-full">
            <h1 className="font-bold text-black text-[2vw] text-center">Run Experiments Like It’s 2025 <br/> 
Real Time, Visual interfaces, No Bottlenecks</h1>
            <h2 className="mt-4 text-xl text-slate-900 w-[50vw] text-center">
            Eowrap is a simple, performant, & collaborative experiment orchestrator <br/>empowering researchers to setup, run, and analyze experiments in real-time.
            </h2>
            <a href='/create' className='px-8 py-4 mt-4 rounded-xl bg-transparent text-white hover:translate-y-[-5px] bg-black transition-all duration-500 ease-in-out pointer-events-auto text-lg hover:text-xl w-[20rem] text-center'>
                Create An Experiment
            </a>
        </div>
        </section>
    </AuroraBackground>
  )
}

export default Hero